import { randomUUID } from "node:crypto"
import { and, asc, count, desc, eq, gt, inArray, isNotNull, lt, sql } from "drizzle-orm"
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3"
import { shuffle } from "lodash-es"
import { z } from "zod"
import type {
  AppSettings,
  DownloadStatus,
  ImportJob,
  LyricsState,
  Playlist,
  PlaylistTrackItem,
  Provider,
  QueueItem,
  Track,
  TrackCandidate,
} from "../../shared/types/music"
import {
  isSystemPlaylistId,
  LIKED_SONGS_PLAYLIST_ID,
  OFFLINE_SONGS_PLAYLIST_ID,
} from "../../shared/types/music"
import * as schema from "./schema"
import type { DbAlbum, DbArtist, DbTrack } from "./types"
import {
  mapImport,
  mapLyricsCache,
  mapPlaylistTrackRow,
  mapQueueItem,
  mapTrack,
  mapTrackCandidateFromJson,
} from "./types"

const trackColumns = {
  id: schema.tracks.id,
  title: schema.tracks.title,
  artist: schema.tracks.artist,
  album: schema.tracks.album,
  artistId: schema.tracks.artistId,
  albumId: schema.tracks.albumId,
  durationMs: schema.tracks.durationMs,
  thumbnailUrl: schema.tracks.thumbnailUrl,
  canonicalUrl: schema.tracks.canonicalUrl,
  provider: schema.tracks.provider,
  likedAt: schema.tracks.likedAt,
  downloadStatus: schema.tracks.downloadStatus,
  downloadProgress: schema.tracks.downloadProgress,
  downloadedFilePath: schema.tracks.downloadedFilePath,
  downloadError: schema.tracks.downloadError,
  downloadedAt: schema.tracks.downloadedAt,
  createdAt: schema.tracks.createdAt,
  updatedAt: schema.tracks.updatedAt,
} as const

const playlistTrackSelectColumns = {
  playlistId: schema.playlistTracks.playlistId,
  playlistEntryId: schema.playlistTracks.id,
  addedAt: schema.playlistTracks.addedAt,
  ...trackColumns,
} as const

const queueItemColumns = {
  id: schema.queueItems.id,
  trackId: schema.queueItems.trackId,
  sourceUrl: schema.queueItems.sourceUrl,
  sortOrder: schema.queueItems.sortOrder,
  status: schema.queueItems.status,
  createdAt: schema.queueItems.createdAt,
  t_id: schema.tracks.id,
  t_title: schema.tracks.title,
  t_artist: schema.tracks.artist,
  t_album: schema.tracks.album,
  t_artist_id: schema.tracks.artistId,
  t_album_id: schema.tracks.albumId,
  t_duration_ms: schema.tracks.durationMs,
  t_thumbnail_url: schema.tracks.thumbnailUrl,
  t_canonical_url: schema.tracks.canonicalUrl,
  t_provider: schema.tracks.provider,
  t_liked_at: schema.tracks.likedAt,
  t_download_status: schema.tracks.downloadStatus,
  t_download_progress: schema.tracks.downloadProgress,
  t_downloaded_file_path: schema.tracks.downloadedFilePath,
  t_download_error: schema.tracks.downloadError,
  t_downloaded_at: schema.tracks.downloadedAt,
  t_created_at: schema.tracks.createdAt,
  t_updated_at: schema.tracks.updatedAt,
} as const

const defaultSettings: AppSettings = {
  installationId: randomUUID(),
  mpvPath: "mpv",
  ytdlpPath: "yt-dlp",
  playbackVolume: 75,
  resolverTimeoutMs: 30_000,
  cacheTtlHours: 6,
  streamCacheTtlMinutes: 90,
  importMaxTracks: 100,
  importMatchConcurrency: 4,
  spotifyMatchScoreThreshold: 0.42,
  deezerMatchThreshold: 0.35,
  importProgressThrottle: 3,
  discordPresenceEnabled: true,
  recommendationsEnabled: true,
  recommendationsRolloutPercent: 5,
}

const appSettingsSchema = z.object({
  installationId: z.string().min(1),
  mpvPath: z.string(),
  ytdlpPath: z.string(),
  playbackVolume: z.number().int().min(0).max(100),
  resolverTimeoutMs: z.number().int().positive(),
  cacheTtlHours: z.number().int().positive(),
  streamCacheTtlMinutes: z.number().int().positive(),
  importMaxTracks: z.number().int().min(1).max(500),
  importMatchConcurrency: z.number().int().min(1).max(16),
  spotifyMatchScoreThreshold: z.number().min(0).max(1),
  deezerMatchThreshold: z.number().min(0).max(1),
  importProgressThrottle: z.number().int().min(1).max(100),
  discordPresenceEnabled: z.boolean(),
  recommendationsEnabled: z.boolean(),
  recommendationsRolloutPercent: z.number().int().min(0).max(100),
})

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

function now(): number {
  return Date.now()
}

export class SettingsRepository {
  private cache: AppSettings | null = null

  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  get(): AppSettings {
    if (this.cache) {
      return this.cache
    }
    const rows = this.db.select().from(schema.settings).all()

    const raw: Record<string, unknown> = { ...defaultSettings }
    for (const row of rows) {
      if (row.value === "true") {
        raw[row.key] = true
      } else if (row.value === "false") {
        raw[row.key] = false
      } else if (!Number.isNaN(Number(row.value)) && row.value.trim() !== "") {
        raw[row.key] = Number(row.value)
      } else {
        raw[row.key] = row.value
      }
    }

    const result = appSettingsSchema.safeParse(raw)
    const resolved = result.success ? result.data : defaultSettings
    this.cache = resolved
    return resolved
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.get(), ...patch }
    const timestamp = now()
    this.db.transaction(() => {
      for (const [key, value] of Object.entries(next)) {
        this.db
          .insert(schema.settings)
          .values({ key, value: String(value), updatedAt: timestamp })
          .onConflictDoUpdate({
            target: schema.settings.key,
            set: { value: String(value), updatedAt: timestamp },
          })
          .run()
      }
    })
    this.cache = next
    return next
  }
}

export class LibraryRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  upsertTrack(candidate: TrackCandidate): Track {
    return this.db.transaction(() => {
      const existing = this.findTrackRowBySourceUrl(candidate.sourceUrl)
      const existingById =
        !existing && candidate.sourceId
          ? this.findTrackRowByProviderSourceId(candidate.provider, candidate.sourceId)
          : undefined
      const row = existing ?? existingById
      const timestamp = now()

      if (row) {
        const targetId = row.id
        const fromAlternateSource = existingById && !existing
        if (fromAlternateSource) {
          const hasSourceUrl = this.db
            .select()
            .from(schema.trackSources)
            .where(
              and(
                eq(schema.trackSources.trackId, targetId),
                eq(schema.trackSources.sourceUrl, candidate.sourceUrl)
              )
            )
            .get()
          if (!hasSourceUrl) {
            this.db
              .insert(schema.trackSources)
              .values({
                id: id("src"),
                trackId: targetId,
                provider: candidate.provider,
                sourceUrl: candidate.sourceUrl,
                sourceId: candidate.sourceId,
                extractor: candidate.extractor,
                lastResolvedAt: timestamp,
                lastStatus: "ready",
              })
              .run()
          }
        }
        const title =
          candidate.title.trim() && candidate.title !== "Untitled track"
            ? candidate.title
            : row.title
        this.db
          .update(schema.tracks)
          .set({
            title,
            artist: candidate.artist ?? row.artist,
            album: candidate.album ?? row.album,
            durationMs: candidate.durationMs ?? row.durationMs,
            thumbnailUrl: candidate.thumbnailUrl ?? row.thumbnailUrl,
            canonicalUrl: candidate.canonicalUrl,
            provider: candidate.provider,
            updatedAt: timestamp,
          })
          .where(eq(schema.tracks.id, targetId))
          .run()
        this.db
          .update(schema.trackSources)
          .set({
            sourceId: candidate.sourceId,
            extractor: candidate.extractor,
            lastResolvedAt: timestamp,
            lastStatus: "ready",
          })
          .where(eq(schema.trackSources.sourceUrl, candidate.sourceUrl))
          .run()
        const updated = this.getTrack(targetId)
        if (!updated) {
          throw new Error(`Expected track ${targetId} after upsert`)
        }
        return updated
      }

      const trackId = id("trk")
      this.db
        .insert(schema.tracks)
        .values({
          id: trackId,
          title: candidate.title,
          artist: candidate.artist,
          album: candidate.album ?? null,
          artistId: null,
          albumId: null,
          durationMs: candidate.durationMs,
          thumbnailUrl: candidate.thumbnailUrl,
          canonicalUrl: candidate.canonicalUrl,
          provider: candidate.provider,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .run()
      this.db
        .insert(schema.trackSources)
        .values({
          id: id("src"),
          trackId: trackId,
          provider: candidate.provider,
          sourceUrl: candidate.sourceUrl,
          sourceId: candidate.sourceId,
          extractor: candidate.extractor,
          lastResolvedAt: timestamp,
          lastStatus: "ready",
        })
        .run()
      const created = this.getTrack(trackId)
      if (!created) {
        throw new Error(`Expected track ${trackId} after insert`)
      }
      return created
    })
  }

  findTrackRowBySourceUrl(sourceUrl: string): DbTrack | undefined {
    const result = this.db
      .select(trackColumns)
      .from(schema.tracks)
      .innerJoin(schema.trackSources, eq(schema.trackSources.trackId, schema.tracks.id))
      .where(eq(schema.trackSources.sourceUrl, sourceUrl))
      .get()
    return result
  }

  findTrackRowByCanonicalUrl(canonicalUrl: string): DbTrack | undefined {
    const result = this.db
      .select()
      .from(schema.tracks)
      .where(eq(schema.tracks.canonicalUrl, canonicalUrl))
      .get()
    return result
  }

  findTrackRowByProviderSourceId(provider: Provider, sourceId: string): DbTrack | undefined {
    const result = this.db
      .select(trackColumns)
      .from(schema.tracks)
      .innerJoin(schema.trackSources, eq(schema.trackSources.trackId, schema.tracks.id))
      .where(
        and(eq(schema.trackSources.provider, provider), eq(schema.trackSources.sourceId, sourceId))
      )
      .get()
    return result
  }

  findSourceUrlByCanonicalUrl(canonicalUrl: string): string | null {
    const map = this.findSourceUrlsForCanonicalUrls([canonicalUrl])
    return map.get(canonicalUrl) ?? null
  }

  findSourceUrlsForCanonicalUrls(canonicalUrls: string[]): Map<string, string> {
    if (canonicalUrls.length === 0) return new Map()
    const rows = this.db
      .select({
        canonicalUrl: schema.tracks.canonicalUrl,
        sourceUrl: schema.trackSources.sourceUrl,
      })
      .from(schema.tracks)
      .innerJoin(schema.trackSources, eq(schema.trackSources.trackId, schema.tracks.id))
      .where(inArray(schema.tracks.canonicalUrl, canonicalUrls))
      .all()
    const map = new Map<string, string>()
    for (const row of rows) {
      if (!map.has(row.canonicalUrl)) {
        map.set(row.canonicalUrl, row.sourceUrl)
      }
    }
    return map
  }

  findDownloadSourceUrlForTrack(trackId: string): string | null {
    const rows = this.db
      .select({
        sourceUrl: schema.trackSources.sourceUrl,
        provider: schema.trackSources.provider,
      })
      .from(schema.trackSources)
      .where(eq(schema.trackSources.trackId, trackId))
      .all()
    if (rows.length === 0) return null

    const providerPriority: Record<string, number> = {
      youtube: 0,
      soundcloud: 1,
      bandcamp: 2,
      direct: 3,
      unknown: 4,
    }
    const sorted = [...rows].sort((a, b) => {
      const left = providerPriority[a.provider] ?? Number.MAX_SAFE_INTEGER
      const right = providerPriority[b.provider] ?? Number.MAX_SAFE_INTEGER
      return left - right
    })
    return sorted[0]?.sourceUrl ?? null
  }

  findArtistByDeezerId(deezerId: number): DbArtist | undefined {
    return this.db.select().from(schema.artists).where(eq(schema.artists.deezerId, deezerId)).get()
  }

  findAlbumByDeezerId(deezerId: number): DbAlbum | undefined {
    return this.db.select().from(schema.albums).where(eq(schema.albums.deezerId, deezerId)).get()
  }

  upsertArtist(deezerId: number, name: string, pictureUrl: string | null): string {
    const existing = this.findArtistByDeezerId(deezerId)
    if (existing) return existing.id
    const artistId = id("art")
    const timestamp = now()
    this.db
      .insert(schema.artists)
      .values({
        id: artistId,
        deezerId,
        name,
        pictureUrl,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run()
    return artistId
  }

  upsertAlbum(
    deezerId: number,
    title: string,
    artistId: string | null,
    coverUrl: string | null,
    albumType: string | null,
    trackCount: number | null
  ): string {
    const existing = this.findAlbumByDeezerId(deezerId)
    if (existing) return existing.id
    const albumId = id("alb")
    const timestamp = now()
    this.db
      .insert(schema.albums)
      .values({
        id: albumId,
        deezerId,
        title,
        artistId,
        coverUrl,
        albumType,
        trackCount,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run()
    return albumId
  }

  getTrack(trackId: string): Track | null {
    const row = this.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId)).get()
    return row ? mapTrack(row) : null
  }

  getTrackNavInfo(trackId: string): { artistDeezerId?: number; albumDeezerId?: number } | null {
    const row = this.db
      .select({
        artistDeezerId: schema.artists.deezerId,
        albumDeezerId: schema.albums.deezerId,
      })
      .from(schema.tracks)
      .leftJoin(schema.artists, eq(schema.artists.id, schema.tracks.artistId))
      .leftJoin(schema.albums, eq(schema.albums.id, schema.tracks.albumId))
      .where(eq(schema.tracks.id, trackId))
      .get()
    if (!row) return null
    const result: { artistDeezerId?: number; albumDeezerId?: number } = {}
    if (row.artistDeezerId != null) result.artistDeezerId = row.artistDeezerId
    if (row.albumDeezerId != null) result.albumDeezerId = row.albumDeezerId
    return Object.keys(result).length > 0 ? result : null
  }

  saveCandidateInTransaction(
    candidate: TrackCandidate,
    targetPlaylistId: string,
    primeCandidate: (c: TrackCandidate) => void
  ): void {
    this.db.transaction((tx) => {
      const txLibrary = new LibraryRepository(tx as unknown as BetterSQLite3Database<typeof schema>)
      primeCandidate(candidate)
      const track = txLibrary.upsertTrack(candidate)
      txLibrary.addTrackToPlaylistRecord(targetPlaylistId, track.id, candidate.sourceUrl)
    })
  }

  saveCandidatesBatch(
    candidates: TrackCandidate[],
    targetPlaylistId: string,
    primeCandidate: (c: TrackCandidate) => void
  ): { saved: number; failed: number } {
    let saved = 0
    let failed = 0
    this.db.transaction((tx) => {
      const txLibrary = new LibraryRepository(tx as unknown as BetterSQLite3Database<typeof schema>)
      for (const candidate of candidates) {
        try {
          primeCandidate(candidate)
          const track = txLibrary.upsertTrack(candidate)
          txLibrary.addTrackToPlaylistRecord(targetPlaylistId, track.id, candidate.sourceUrl)
          saved += 1
        } catch (error) {
          console.error("Failed to save candidate:", candidate, error)
          failed += 1
        }
      }
    })
    return { saved, failed }
  }

  listPlaylists(): Playlist[] {
    const rows = this.db
      .select()
      .from(schema.playlists)
      .orderBy(asc(schema.playlists.sortOrder), asc(schema.playlists.createdAt))
      .all()

    const playlistIds = rows.map((r) => r.id)
    const tracksByPlaylist = new Map<string, PlaylistTrackItem[]>()

    if (playlistIds.length > 0) {
      const trackRows = this.db
        .select(playlistTrackSelectColumns)
        .from(schema.playlistTracks)
        .innerJoin(schema.tracks, eq(schema.tracks.id, schema.playlistTracks.trackId))
        .where(inArray(schema.playlistTracks.playlistId, playlistIds))
        .orderBy(asc(schema.playlistTracks.sortOrder), asc(schema.playlistTracks.addedAt))
        .all()

      for (const row of trackRows) {
        const list = tracksByPlaylist.get(row.playlistId) ?? []
        list.push(mapPlaylistTrackRow(row))
        tracksByPlaylist.set(row.playlistId, list)
      }
    }

    return [
      this.getLikedSongsPlaylist(),
      this.getOfflineSongsPlaylist(),
      ...rows.map((row) => {
        const tracks = tracksByPlaylist.get(row.id) ?? []
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          sortOrder: row.sortOrder,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          totalDurationMs: sumDurationMs(tracks),
          tracks,
        }
      }),
    ]
  }

  listPlaylistsMetadata(): Playlist[] {
    const rows = this.db
      .select()
      .from(schema.playlists)
      .orderBy(asc(schema.playlists.sortOrder), asc(schema.playlists.createdAt))
      .all()
    return [
      this.getLikedSongsPlaylist(),
      this.getOfflineSongsPlaylist(),
      ...rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        totalDurationMs: 0,
        tracks: [],
      })),
    ]
  }

  getPlaylistTracks(playlistId: string): PlaylistTrackItem[] {
    return this.listTracksInPlaylist(playlistId)
  }

  createPlaylist(name: string): Playlist[] {
    this.createPlaylistRecord(name)
    return this.listPlaylistsMetadata()
  }

  createPlaylistRecord(name: string): Playlist {
    const timestamp = now()
    const playlistId = id("pl")
    const playlistName = name.trim() || "Imported Playlist"
    this.db
      .insert(schema.playlists)
      .values({
        id: playlistId,
        name: playlistName,
        description: null,
        sortOrder: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run()
    return {
      id: playlistId,
      name: playlistName,
      description: null,
      sortOrder: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      totalDurationMs: 0,
      tracks: [],
    }
  }

  renamePlaylist(playlistId: string, name: string): Playlist[] {
    if (playlistId === LIKED_SONGS_PLAYLIST_ID || playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      return this.listPlaylistsMetadata()
    }
    this.db
      .update(schema.playlists)
      .set({ name: name.trim(), updatedAt: now() })
      .where(eq(schema.playlists.id, playlistId))
      .run()
    return this.listPlaylistsMetadata()
  }

  deletePlaylist(playlistId: string): Playlist[] {
    if (playlistId === LIKED_SONGS_PLAYLIST_ID || playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      return this.listPlaylistsMetadata()
    }
    this.db.delete(schema.playlists).where(eq(schema.playlists.id, playlistId)).run()
    return this.listPlaylistsMetadata()
  }

  addTrackToPlaylist(playlistId: string, trackId: string, sourceUrl: string): Playlist[] {
    if (playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      throw new Error(
        "Songs in Offline songs are the tracks you have downloaded. Download a track from the menu to add it here, or add songs to a regular playlist before importing."
      )
    }
    if (playlistId === LIKED_SONGS_PLAYLIST_ID) {
      this.setTrackLiked(trackId, true)
      return this.listPlaylists()
    }
    this.addTrackToPlaylistRecord(playlistId, trackId, sourceUrl)
    return this.listPlaylists()
  }

  addTrackToPlaylistRecord(playlistId: string, trackId: string, sourceUrl: string): void {
    if (playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      throw new Error(
        "Cannot add tracks to the Offline songs playlist; it is built from your downloads."
      )
    }
    if (playlistId === LIKED_SONGS_PLAYLIST_ID) {
      this.setTrackLiked(trackId, true)
      return
    }
    const timestamp = now()
    const countResult = this.db
      .select({ count: count() })
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .get()
    const totalCount = countResult?.count ?? 0
    this.db
      .insert(schema.playlistTracks)
      .values({
        id: id("pt"),
        playlistId,
        trackId,
        sortOrder: totalCount,
        addedAt: timestamp,
        addedFrom: sourceUrl,
      })
      .run()
    this.normalizePlaylistTrackSortOrders(playlistId)
    this.db
      .update(schema.playlists)
      .set({ updatedAt: timestamp })
      .where(eq(schema.playlists.id, playlistId))
      .run()
  }

  removeTrackFromPlaylist(playlistId: string, entryId: string): Playlist[] {
    if (isSystemPlaylistId(playlistId)) {
      throw new Error(
        "Songs in system playlists are managed automatically. They cannot be removed with the playlist remove action."
      )
    }
    this.db
      .delete(schema.playlistTracks)
      .where(
        and(eq(schema.playlistTracks.id, entryId), eq(schema.playlistTracks.playlistId, playlistId))
      )
      .run()
    this.normalizePlaylistTrackSortOrders(playlistId)
    this.db
      .update(schema.playlists)
      .set({ updatedAt: now() })
      .where(eq(schema.playlists.id, playlistId))
      .run()
    return this.listPlaylists()
  }

  moveTrackInPlaylist(playlistId: string, entryId: string, newIndex: number): Playlist[] {
    if (playlistId === LIKED_SONGS_PLAYLIST_ID || playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      return this.listPlaylists()
    }
    const rows = this.db
      .select({ id: schema.playlistTracks.id })
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.sortOrder), asc(schema.playlistTracks.addedAt))
      .all()
    const ids = rows.map((r) => r.id)
    const from = ids.indexOf(entryId)
    if (from < 0) {
      return this.listPlaylists()
    }
    const clamped = Math.max(0, Math.min(newIndex, ids.length - 1))
    const reordered = reorderItems(ids, from, clamped)
    this.db.transaction(() => {
      for (let i = 0; i < reordered.length; i++) {
        this.db
          .update(schema.playlistTracks)
          .set({ sortOrder: i })
          .where(eq(schema.playlistTracks.id, reordered[i]))
          .run()
      }
    })
    this.db
      .update(schema.playlists)
      .set({ updatedAt: now() })
      .where(eq(schema.playlists.id, playlistId))
      .run()
    return this.listPlaylists()
  }

  setTrackLiked(trackId: string, liked: boolean): Track {
    const timestamp = now()
    this.db
      .update(schema.tracks)
      .set({ likedAt: liked ? timestamp : null, updatedAt: timestamp })
      .where(eq(schema.tracks.id, trackId))
      .run()
    const track = this.getTrack(trackId)
    if (!track) {
      throw new Error("Track was not found.")
    }
    return track
  }

  setCandidateLiked(candidate: TrackCandidate, liked: boolean): Track {
    const track = this.upsertTrack(candidate)
    return this.setTrackLiked(track.id, liked)
  }

  setDownloadQueued(trackId: string): Track {
    return this.setDownloadState(trackId, {
      status: "queued",
      progress: 0,
      filePath: null,
      error: null,
      downloadedAt: null,
    })
  }

  setDownloadProgress(trackId: string, progress: number): Track {
    return this.setDownloadState(trackId, {
      status: "downloading",
      progress,
      error: null,
    })
  }

  setDownloadComplete(trackId: string, filePath: string): Track {
    return this.setDownloadState(trackId, {
      status: "downloaded",
      progress: 100,
      filePath,
      error: null,
      downloadedAt: now(),
    })
  }

  setDownloadFailed(trackId: string, error: string): Track {
    return this.setDownloadState(trackId, {
      status: "failed",
      progress: 0,
      error,
      filePath: null,
      downloadedAt: null,
    })
  }

  clearDownload(trackId: string): Track {
    return this.setDownloadState(trackId, {
      status: "not-downloaded",
      progress: 0,
      filePath: null,
      error: null,
      downloadedAt: null,
    })
  }

  listTracksInPlaylist(playlistId: string): PlaylistTrackItem[] {
    if (playlistId === LIKED_SONGS_PLAYLIST_ID) {
      return this.listLikedTracks()
    }
    if (playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      return this.listDownloadedTracks()
    }
    return this.listPlaylistTracks(playlistId)
  }

  trackRecommendationImpression(input: {
    sessionId: string
    trackId: string
    position: number
    shownAt: number
  }): void {
    this.db
      .insert(schema.recommendationImpressions)
      .values({
        id: id("reco_imp"),
        sessionId: input.sessionId,
        trackId: input.trackId,
        position: input.position,
        shownAt: input.shownAt,
      })
      .run()
  }

  trackRecommendationInteraction(input: {
    sessionId: string
    trackId: string
    interactionType: "play" | "skip" | "like" | "save" | "dismiss"
    interactedAt: number
    metadataJson?: string | null
  }): void {
    this.db
      .insert(schema.recommendationInteractions)
      .values({
        id: id("reco_evt"),
        sessionId: input.sessionId,
        trackId: input.trackId,
        interactionType: input.interactionType,
        interactedAt: input.interactedAt,
        metadataJson: input.metadataJson ?? null,
      })
      .run()
  }

  getRecommendationMetrics(windowHours: number): {
    impressions: number
    plays: number
    likes: number
    saves: number
    skips: number
    ctr: number
    saveRate: number
    skipRate: number
  } {
    const since = now() - Math.max(1, windowHours) * 60 * 60 * 1000
    const impressionsResult = this.db
      .select({ value: count() })
      .from(schema.recommendationImpressions)
      .where(gt(schema.recommendationImpressions.shownAt, since))
      .get()
    const interactionRows = this.db
      .select({
        interactionType: schema.recommendationInteractions.interactionType,
        value: count(),
      })
      .from(schema.recommendationInteractions)
      .where(gt(schema.recommendationInteractions.interactedAt, since))
      .groupBy(schema.recommendationInteractions.interactionType)
      .all()
    const byType = new Map(interactionRows.map((row) => [row.interactionType, row.value]))
    const impressions = impressionsResult?.value ?? 0
    const plays = byType.get("play") ?? 0
    const likes = byType.get("like") ?? 0
    const saves = byType.get("save") ?? 0
    const skips = (byType.get("skip") ?? 0) + (byType.get("dismiss") ?? 0)
    return {
      impressions,
      plays,
      likes,
      saves,
      skips,
      ctr: impressions > 0 ? plays / impressions : 0,
      saveRate: impressions > 0 ? saves / impressions : 0,
      skipRate: impressions > 0 ? skips / impressions : 0,
    }
  }

  recordPlayStart(trackId: string, sourceUrl: string): string {
    const rowId = id("ph")
    const timestamp = now()
    this.db
      .insert(schema.playHistory)
      .values({
        id: rowId,
        trackId,
        sourceUrl,
        playedAt: timestamp,
        completed: 0,
      })
      .run()
    return rowId
  }

  markPlayHistoryCompleted(rowId: string): void {
    this.db
      .update(schema.playHistory)
      .set({ completed: 1 })
      .where(eq(schema.playHistory.id, rowId))
      .run()
  }

  listRecommendationCandidates(limit: number): { track: Track; score: number; reason: string }[] {
    const parsedLimit = Math.max(1, Math.min(limit, 100))
    const nowTs = now()
    const ninetyDaysAgo = nowTs - 90 * 24 * 60 * 60 * 1000
    const candidateCap = 5000

    // Aggregated listening signals per track (only tracks with play history in the last 90 days,
    // capped to avoid loading an unbounded number of rows)
    const rows = this.db
      .select({
        ...trackColumns,
        playCount: sql<number>`coalesce(count(${schema.playHistory.id}), 0)`,
        completeCount: sql<number>`coalesce(sum(case when ${schema.playHistory.completed} = 1 then 1 else 0 end), 0)`,
        recentPlayTs: sql<number>`max(${schema.playHistory.playedAt})`,
      })
      .from(schema.tracks)
      .innerJoin(schema.playHistory, eq(schema.playHistory.trackId, schema.tracks.id))
      .where(gt(schema.playHistory.playedAt, ninetyDaysAgo))
      .groupBy(schema.tracks.id)
      .limit(candidateCap)
      .all()

    // Playlist membership
    const playlistTrackRows = this.db
      .select({ trackId: schema.playlistTracks.trackId })
      .from(schema.playlistTracks)
      .all()
    const inUserPlaylists = new Set(playlistTrackRows.map((r) => r.trackId))

    // Recent impressions (7 days) for cross-session dedup
    const weekAgo = nowTs - 7 * 24 * 60 * 60 * 1000
    const recentImpressionRows = this.db
      .select({ trackId: schema.recommendationImpressions.trackId })
      .from(schema.recommendationImpressions)
      .where(gt(schema.recommendationImpressions.shownAt, weekAgo))
      .all()
    const recentlyShown = new Set(recentImpressionRows.map((r) => r.trackId))

    // Negative interactions (skip / dismiss) in last 14 days
    const twoWeeksAgo = nowTs - 14 * 24 * 60 * 60 * 1000
    const negativeTrackIds = this.db
      .select({ trackId: schema.recommendationInteractions.trackId })
      .from(schema.recommendationInteractions)
      .where(
        and(
          gt(schema.recommendationInteractions.interactedAt, twoWeeksAgo),
          eq(schema.recommendationInteractions.interactionType, "skip")
        )
      )
      .all()
      .map((r) => r.trackId)
    const dismissedTrackIds = this.db
      .select({ trackId: schema.recommendationInteractions.trackId })
      .from(schema.recommendationInteractions)
      .where(
        and(
          gt(schema.recommendationInteractions.interactedAt, twoWeeksAgo),
          eq(schema.recommendationInteractions.interactionType, "dismiss")
        )
      )
      .all()
      .map((r) => r.trackId)
    const recentlyDismissed = new Set([...negativeTrackIds, ...dismissedTrackIds])

    // Compute max playCount for normalization
    let maxPlayCount = 0
    for (const row of rows) {
      const pc = Number(row.playCount ?? 0)
      if (pc > maxPlayCount) maxPlayCount = pc
    }
    if (maxPlayCount < 1) maxPlayCount = 1

    const scored = rows.map((row) => {
      const track = mapTrack(row)
      const playCount = Number(row.playCount ?? 0)
      const completeCount = Number(row.completeCount ?? 0)
      const recentPlayTs = Number(row.recentPlayTs ?? 0)

      // Normalized signals [0,1]
      const rawAffinity = playCount + completeCount * 1.5 + (track.likedAt ? 3 : 0)
      const affinity = Math.min(1, rawAffinity / 10)
      const novelty = Math.max(0, 1 - playCount / maxPlayCount)
      const hoursSincePlay = recentPlayTs > 0 ? (nowTs - recentPlayTs) / (1000 * 60 * 60) : Infinity
      const recency = recentPlayTs > 0 ? Math.exp(-hoursSincePlay / 72) : 0

      // Penalty for recent negative feedback
      const penalty = recentlyDismissed.has(track.id) ? 0.5 : 0

      const score = affinity * 0.3 + novelty * 0.4 + recency * 0.3 - penalty

      // Honest reason based on dominant signal
      let reason = "From your library"
      if (novelty > 0.65 && playCount <= 2) {
        reason = recentPlayTs > 0 ? "A hidden gem you played once" : "A hidden gem"
      } else if (recency > affinity && recency > 0.3) {
        reason = "Recently on repeat"
      } else if (affinity > 0.4) {
        reason = track.likedAt ? "A favorite of yours" : "Replayed often"
      }

      return { track, score, playCount, completeCount, recentPlayTs, reason }
    })

    // Discovery-first filtering (exclude liked + in-playlist tracks from top priority)
    const discoveryPool = scored.filter(
      (entry) => !entry.track.likedAt && !inUserPlaylists.has(entry.track.id)
    )
    const secondaryPool = scored.filter(
      (entry) => !entry.track.likedAt || (entry.track.likedAt && entry.playCount > 0)
    )
    const orderedPool = discoveryPool.length >= parsedLimit ? discoveryPool : secondaryPool

    // Apply cross-session dedup
    const deduped = orderedPool.filter((entry) => {
      if (recentlyDismissed.has(entry.track.id)) return false
      if (recentlyShown.has(entry.track.id) && entry.score < 0.55) return false
      return true
    })

    deduped.sort((a, b) => b.score - a.score)

    // Build results with artist cap=2 and honest reason mapping
    const results: { track: Track; score: number; reason: string }[] = []
    const artistGuard = new Map<string, number>()
    for (const entry of deduped) {
      if (results.length >= parsedLimit) break
      const artistKey = entry.track.artist?.trim().toLowerCase() ?? `artist:${entry.track.id}`
      const artistCount = artistGuard.get(artistKey) ?? 0
      if (artistCount >= 2) continue
      results.push({ track: entry.track, score: entry.score, reason: entry.reason })
      artistGuard.set(artistKey, artistCount + 1)
    }

    return results
  }

  private setDownloadState(
    trackId: string,
    input: {
      status: DownloadStatus
      progress: number
      filePath?: string | null
      error?: string | null
      downloadedAt?: number | null
    }
  ): Track {
    const existing = this.getTrack(trackId)
    if (!existing) {
      throw new Error("Track was not found.")
    }
    this.db
      .update(schema.tracks)
      .set({
        downloadStatus: input.status,
        downloadProgress: input.progress,
        downloadedFilePath:
          input.filePath === undefined ? existing.downloadedFilePath : input.filePath,
        downloadError: input.error === undefined ? existing.downloadError : input.error,
        downloadedAt: input.downloadedAt === undefined ? existing.downloadedAt : input.downloadedAt,
        updatedAt: now(),
      })
      .where(eq(schema.tracks.id, trackId))
      .run()
    const track = this.getTrack(trackId)
    if (!track) {
      throw new Error("Track was not found after update.")
    }
    return track
  }

  private getLikedSongsPlaylist(): Playlist {
    const row = this.db
      .select({
        totalDurationMs: sql<number>`coalesce(sum(${schema.tracks.durationMs}), 0)`,
        cnt: count(),
        oldestLiked: sql<number>`min(${schema.tracks.likedAt})`,
        newestLiked: sql<number>`max(${schema.tracks.likedAt})`,
      })
      .from(schema.tracks)
      .where(isNotNull(schema.tracks.likedAt))
      .get()

    const trackCount = Number(row?.cnt ?? 0)
    const totalDurationMs = Number(row?.totalDurationMs ?? 0)
    const createdAt = row?.oldestLiked ?? 0
    const updatedAt = row?.newestLiked ?? createdAt

    return {
      id: LIKED_SONGS_PLAYLIST_ID,
      name: "Liked Songs",
      description: "Songs you have hearted in Loopify.",
      sortOrder: -1,
      createdAt,
      updatedAt,
      isSystem: true,
      totalDurationMs,
      trackCount,
      tracks: undefined,
    }
  }

  private getOfflineSongsPlaylist(): Playlist {
    const row = this.db
      .select({
        totalDurationMs: sql<number>`coalesce(sum(${schema.tracks.durationMs}), 0)`,
        cnt: count(),
        oldestTs: sql<number>`min(coalesce(${schema.tracks.downloadedAt}, ${schema.tracks.updatedAt}))`,
        newestTs: sql<number>`max(coalesce(${schema.tracks.downloadedAt}, ${schema.tracks.updatedAt}))`,
      })
      .from(schema.tracks)
      .where(
        and(
          eq(schema.tracks.downloadStatus, "downloaded"),
          sql`coalesce(trim(${schema.tracks.downloadedFilePath}), '') != ''`
        )
      )
      .get()

    const trackCount = Number(row?.cnt ?? 0)
    const totalDurationMs = Number(row?.totalDurationMs ?? 0)
    const createdAt = row?.oldestTs ?? 0
    const updatedAt = row?.newestTs ?? createdAt

    return {
      id: OFFLINE_SONGS_PLAYLIST_ID,
      name: "Offline songs",
      description: "Music stored on this device for offline playback.",
      sortOrder: 0,
      createdAt,
      updatedAt,
      isSystem: true,
      totalDurationMs,
      trackCount,
      tracks: undefined,
    }
  }

  private normalizePlaylistTrackSortOrders(playlistId: string): void {
    const rows = this.db
      .select({ id: schema.playlistTracks.id })
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.sortOrder), asc(schema.playlistTracks.addedAt))
      .all()
    this.db.transaction(() => {
      for (let i = 0; i < rows.length; i++) {
        this.db
          .update(schema.playlistTracks)
          .set({ sortOrder: i })
          .where(eq(schema.playlistTracks.id, rows[i].id))
          .run()
      }
    })
  }

  private listPlaylistTracks(playlistId: string): PlaylistTrackItem[] {
    const rows = this.db
      .select(playlistTrackSelectColumns)
      .from(schema.playlistTracks)
      .innerJoin(schema.tracks, eq(schema.tracks.id, schema.playlistTracks.trackId))
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.sortOrder), asc(schema.playlistTracks.addedAt))
      .all()
    return rows.map((row) => mapPlaylistTrackRow(row))
  }

  private listLikedTracks(): PlaylistTrackItem[] {
    const rows = this.db
      .select({
        playlistEntryId: sql<string>`'liked_' || ${schema.tracks.id}`,
        addedAt: sql<number>`coalesce(${schema.tracks.likedAt}, 0)`,
        ...trackColumns,
      })
      .from(schema.tracks)
      .where(isNotNull(schema.tracks.likedAt))
      .orderBy(desc(schema.tracks.likedAt), desc(schema.tracks.createdAt))
      .all()
    return rows.map((row) => mapPlaylistTrackRow(row))
  }

  private listDownloadedTracks(): PlaylistTrackItem[] {
    const rows = this.db
      .select({
        playlistEntryId: sql<string>`'offline_' || ${schema.tracks.id}`,
        addedAt: sql<number>`coalesce(${schema.tracks.downloadedAt}, ${schema.tracks.updatedAt})`,
        ...trackColumns,
      })
      .from(schema.tracks)
      .where(
        and(
          eq(schema.tracks.downloadStatus, "downloaded"),
          sql`coalesce(trim(${schema.tracks.downloadedFilePath}), '') != ''`
        )
      )
      .orderBy(
        desc(sql`coalesce(${schema.tracks.downloadedAt}, ${schema.tracks.updatedAt})`),
        desc(schema.tracks.createdAt)
      )
      .all()
    return rows.map((row) => mapPlaylistTrackRow(row, { addedAt: row.addedAt ?? 0 }))
  }
}

export class QueueRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  list(): QueueItem[] {
    const rows = this.db
      .select(queueItemColumns)
      .from(schema.queueItems)
      .leftJoin(schema.tracks, eq(schema.tracks.id, schema.queueItems.trackId))
      .orderBy(asc(schema.queueItems.sortOrder), asc(schema.queueItems.createdAt))
      .all()
    return rows.map(mapQueueItem)
  }

  add(sourceUrl: string, trackId: string | null = null): QueueItem[] {
    const maxSortOrder = this.db
      .select({ sortOrder: sql<number>`coalesce(max(${schema.queueItems.sortOrder}), -1)` })
      .from(schema.queueItems)
      .get()
    this.db
      .insert(schema.queueItems)
      .values({
        id: id("q"),
        trackId,
        sourceUrl,
        sortOrder: (maxSortOrder?.sortOrder ?? -1) + 1,
        status: trackId ? "ready" : "queued",
        createdAt: now(),
      })
      .run()
    return this.list()
  }

  addMany(sourceUrls: string[]): QueueItem[] {
    this.db.transaction(() => {
      const maxSortOrder = this.db
        .select({ sortOrder: sql<number>`coalesce(max(${schema.queueItems.sortOrder}), -1)` })
        .from(schema.queueItems)
        .get()
      let nextSortOrder = (maxSortOrder?.sortOrder ?? -1) + 1
      for (const sourceUrl of sourceUrls) {
        this.db
          .insert(schema.queueItems)
          .values({
            id: id("q"),
            sourceUrl,
            sortOrder: nextSortOrder++,
            status: "queued",
            createdAt: now(),
          })
          .run()
      }
    })
    return this.list()
  }

  setTrack(queueItemId: string, trackId: string, status: QueueItem["status"]): void {
    this.db
      .update(schema.queueItems)
      .set({ trackId, status })
      .where(eq(schema.queueItems.id, queueItemId))
      .run()
  }

  setStatus(queueItemId: string, status: QueueItem["status"]): void {
    this.db
      .update(schema.queueItems)
      .set({ status })
      .where(eq(schema.queueItems.id, queueItemId))
      .run()
  }

  clearPlaying(): void {
    this.db
      .update(schema.queueItems)
      .set({
        status: sql`case when ${schema.queueItems.trackId} is null then 'queued' else 'ready' end`,
      })
      .where(eq(schema.queueItems.status, "playing"))
      .run()
  }

  trimBefore(queueItemId: string): QueueItem[] {
    const target = this.db
      .select({ sortOrder: schema.queueItems.sortOrder })
      .from(schema.queueItems)
      .where(eq(schema.queueItems.id, queueItemId))
      .get()
    if (!target) {
      return this.list()
    }
    this.db.delete(schema.queueItems).where(lt(schema.queueItems.sortOrder, target.sortOrder)).run()
    return this.list()
  }

  remove(queueItemId: string): QueueItem[] {
    this.db.delete(schema.queueItems).where(eq(schema.queueItems.id, queueItemId)).run()
    return this.list()
  }

  move(queueItemId: string, sortOrder: number): QueueItem[] {
    const rows = this.db
      .select({ id: schema.queueItems.id })
      .from(schema.queueItems)
      .orderBy(asc(schema.queueItems.sortOrder), asc(schema.queueItems.createdAt))
      .all()
    const ids = rows.map((row) => row.id)
    const from = ids.indexOf(queueItemId)
    if (from < 0) {
      return this.list()
    }
    const clamped = Math.max(0, Math.min(sortOrder, ids.length - 1))
    const reordered = reorderItems(ids, from, clamped)
    this.db.transaction(() => {
      for (let i = 0; i < reordered.length; i++) {
        this.db
          .update(schema.queueItems)
          .set({ sortOrder: i })
          .where(eq(schema.queueItems.id, reordered[i]))
          .run()
      }
    })
    return this.list()
  }

  shuffle(anchorQueueItemId: string | null): QueueItem[] {
    const rows = this.db
      .select({ id: schema.queueItems.id })
      .from(schema.queueItems)
      .orderBy(asc(schema.queueItems.sortOrder), asc(schema.queueItems.createdAt))
      .all()
    if (rows.length <= 1) {
      return this.list()
    }

    let ids = rows.map((r) => r.id)
    if (anchorQueueItemId) {
      const anchorIndex = ids.indexOf(anchorQueueItemId)
      if (anchorIndex >= 0) {
        const [anchor] = ids.splice(anchorIndex, 1)
        ids = [anchor, ...shuffle(ids)]
      } else {
        ids = shuffle(ids)
      }
    } else {
      ids = shuffle(ids)
    }

    const sortedIds = ids
    this.db.transaction(() => {
      for (let i = 0; i < sortedIds.length; i++) {
        this.db
          .update(schema.queueItems)
          .set({ sortOrder: i })
          .where(eq(schema.queueItems.id, sortedIds[i]))
          .run()
      }
    })
    return this.list()
  }

  clear(): QueueItem[] {
    this.db.delete(schema.queueItems).run()
    return []
  }

  get(queueItemId: string): QueueItem | null {
    const row = this.db
      .select(queueItemColumns)
      .from(schema.queueItems)
      .leftJoin(schema.tracks, eq(schema.tracks.id, schema.queueItems.trackId))
      .where(eq(schema.queueItems.id, queueItemId))
      .get()
    return row ? mapQueueItem(row) : null
  }

  nextItemId(afterId: string): string | null {
    const target = this.db
      .select({ sortOrder: schema.queueItems.sortOrder })
      .from(schema.queueItems)
      .where(eq(schema.queueItems.id, afterId))
      .get()
    if (!target) {
      return null
    }
    const row = this.db
      .select({ id: schema.queueItems.id })
      .from(schema.queueItems)
      .where(gt(schema.queueItems.sortOrder, target.sortOrder))
      .orderBy(asc(schema.queueItems.sortOrder), asc(schema.queueItems.createdAt))
      .limit(1)
      .get()
    return row?.id ?? null
  }
}

export class ResolverCacheRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  getFresh(
    sourceUrl: string
  ): { candidate: TrackCandidate; streamUrl: string | null; expiresAt: number | null } | null {
    const row = this.db
      .select()
      .from(schema.resolverCache)
      .where(eq(schema.resolverCache.sourceUrl, sourceUrl))
      .orderBy(desc(schema.resolverCache.updatedAt))
      .limit(1)
      .get()

    if (!row?.metadataJson) {
      return null
    }

    const t = now()
    const metadataFresh = row.expiresAt === null || row.expiresAt > t
    if (!metadataFresh) {
      return null
    }

    const candidate = mapTrackCandidateFromJson(row.metadataJson)
    if (!candidate) {
      this.db.delete(schema.resolverCache).where(eq(schema.resolverCache.id, row.id)).run()
      return null
    }

    const streamTtl = row.streamExpiresAt
    const streamValid =
      row.streamUrl && (streamTtl === null || streamTtl === undefined || streamTtl > t)
    return {
      candidate,
      streamUrl: streamValid ? row.streamUrl : null,
      expiresAt: row.expiresAt,
    }
  }

  setResolved(
    sourceUrl: string,
    resolved: {
      candidate: TrackCandidate
      streamUrl: string | null
      expiresAt: number | null
      streamExpiresAt: number | null
    }
  ): void {
    const timestamp = now()

    this.db
      .insert(schema.resolverCache)
      .values({
        id: id("rc"),
        sourceUrl,
        provider: resolved.candidate.provider,
        streamUrl: resolved.streamUrl,
        metadataJson: JSON.stringify(resolved.candidate),
        expiresAt: resolved.expiresAt,
        streamExpiresAt: resolved.streamExpiresAt,
        failureCode: null,
        failureMessage: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate({
        target: schema.resolverCache.sourceUrl,
        set: {
          provider: resolved.candidate.provider,
          streamUrl: resolved.streamUrl,
          metadataJson: JSON.stringify(resolved.candidate),
          expiresAt: resolved.expiresAt,
          streamExpiresAt: resolved.streamExpiresAt,
          failureCode: null,
          failureMessage: null,
          updatedAt: timestamp,
        },
      })
      .run()
  }
  purgeExpired(): number {
    const nowTs = Date.now()
    const result = this.db
      .delete(schema.resolverCache)
      .where(
        and(isNotNull(schema.resolverCache.expiresAt), lt(schema.resolverCache.expiresAt, nowTs))
      )
      .run()
    return result.changes
  }
}

export type LyricsCacheInput = {
  id: string
  trackTitle: string
  artist: string | null
  album: string | null
  durationMs: number | null
  canonicalUrl: string
  provider: Provider
  state: LyricsState
  expiresAt?: number | null
}

export class LyricsCacheRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  get(cacheKey: string): LyricsState | null {
    const row = this.db
      .select()
      .from(schema.lyricsCache)
      .where(eq(schema.lyricsCache.id, cacheKey))
      .get()
    if (!row) {
      return null
    }
    if (row.expiresAt !== null && Date.now() > row.expiresAt.getTime()) {
      this.db.delete(schema.lyricsCache).where(eq(schema.lyricsCache.id, cacheKey)).run()
      return null
    }
    const result = mapLyricsCache(row)
    if (result === null) {
      this.db.delete(schema.lyricsCache).where(eq(schema.lyricsCache.id, cacheKey)).run()
    }
    return result
  }

  set(input: LyricsCacheInput): LyricsState {
    const { state } = input
    const lyrics = state.status === "synced" || state.status === "static" ? state.lyrics : null
    const lyricsValues = {
      trackTitle: input.trackTitle,
      artist: input.artist,
      album: input.album,
      durationMs: input.durationMs,
      canonicalUrl: input.canonicalUrl,
      provider: input.provider,
      status: state.status,
      source: lyrics?.source ?? null,
      providerTrackId: lyrics?.providerTrackId ?? null,
      syncedLyricsJson: lyrics
        ? JSON.stringify("lines" in lyrics ? lyrics.lines : lyrics.text)
        : null,
      errorMessage: state.reason,
      fetchedAt: lyrics?.fetchedAt ?? now(),
      expiresAt: input.expiresAt != null ? new Date(input.expiresAt) : null,
      updatedAt: new Date(),
    }
    this.db
      .insert(schema.lyricsCache)
      .values({
        id: input.id,
        ...lyricsValues,
      })
      .onConflictDoUpdate({
        target: schema.lyricsCache.id,
        set: lyricsValues,
      })
      .run()
    return state
  }

  purgeExpired(): number {
    const nowTs = new Date()
    const result = this.db
      .delete(schema.lyricsCache)
      .where(and(isNotNull(schema.lyricsCache.expiresAt), lt(schema.lyricsCache.expiresAt, nowTs)))
      .run()
    return result.changes
  }
}

export class ImportRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  private jobParams(job: ImportJob): {
    targetPlaylistId: string | null
    playlistTitle: string | null
    status: string
    phase: string
    sourceKind: string | null
    total: number
    completed: number
    failed: number
    matched: number
    skipped: number
    truncated: number
    sourceTrackCount: number | null
    finishedAt: number | null
    errorMessage: string | null
  } {
    return {
      targetPlaylistId: job.targetPlaylistId,
      playlistTitle: job.playlistTitle,
      status: job.status,
      phase: job.phase,
      sourceKind: job.sourceKind,
      total: job.total,
      completed: job.completed,
      failed: job.failed,
      matched: job.matched,
      skipped: job.skipped,
      truncated: job.truncated ? 1 : 0,
      sourceTrackCount: job.sourceTrackCount,
      finishedAt: job.finishedAt,
      errorMessage: job.errorMessage,
    }
  }

  create(inputUrl: string, targetPlaylistId: string | null): ImportJob {
    const job: ImportJob = {
      id: id("imp"),
      inputUrl,
      targetPlaylistId,
      playlistTitle: null,
      status: "queued",
      phase: "queued",
      sourceKind: null,
      total: 0,
      completed: 0,
      failed: 0,
      matched: 0,
      skipped: 0,
      truncated: false,
      sourceTrackCount: null,
      createdAt: now(),
      finishedAt: null,
      errorMessage: null,
    }
    this.db
      .insert(schema.imports)
      .values({
        id: job.id,
        inputUrl: job.inputUrl,
        targetPlaylistId: job.targetPlaylistId,
        playlistTitle: job.playlistTitle,
        status: job.status,
        phase: job.phase,
        sourceKind: job.sourceKind,
        total: job.total,
        completed: job.completed,
        failed: job.failed,
        matched: job.matched,
        skipped: job.skipped,
        truncated: job.truncated ? 1 : 0,
        sourceTrackCount: job.sourceTrackCount,
        createdAt: job.createdAt,
        finishedAt: job.finishedAt,
        errorMessage: job.errorMessage,
      })
      .run()
    return job
  }

  update(job: ImportJob): ImportJob {
    const params = this.jobParams(job)
    this.db
      .update(schema.imports)
      .set({
        targetPlaylistId: params.targetPlaylistId,
        playlistTitle: params.playlistTitle,
        status: params.status,
        phase: params.phase,
        sourceKind: params.sourceKind,
        total: params.total,
        completed: params.completed,
        failed: params.failed,
        matched: params.matched,
        skipped: params.skipped,
        truncated: params.truncated,
        sourceTrackCount: params.sourceTrackCount,
        finishedAt: params.finishedAt,
        errorMessage: params.errorMessage,
      })
      .where(eq(schema.imports.id, job.id))
      .run()
    return job
  }

  get(importId: string): ImportJob | null {
    const row = this.db.select().from(schema.imports).where(eq(schema.imports.id, importId)).get()
    if (!row) return null
    return mapImport(row)
  }
}

function sumDurationMs(tracks: { durationMs: number | null }[]): number {
  return tracks.reduce((total, track) => total + (track.durationMs ?? 0), 0)
}

function reorderItems<T>(items: T[], from: number, to: number): T[] {
  const result = [...items]
  const [moved] = result.splice(from, 1)
  result.splice(to, 0, moved)
  return result
}
