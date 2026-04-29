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
import type { DbTrack } from "./types"
import {
  mapImport,
  mapLyricsCache,
  mapQueueItem,
  mapTrack,
  mapTrackCandidateFromJson,
} from "./types"

const defaultSettings: AppSettings = {
  mpvPath: "mpv",
  ytdlpPath: "yt-dlp",
  playbackVolume: 75,
  resolverTimeoutMs: 30_000,
  cacheTtlHours: 6,
  streamCacheTtlMinutes: 90,
  importMaxTracks: 100,
  importMatchConcurrency: 4,
  spotifyMatchScoreThreshold: 0.42,
  metadataEnrichmentEnabled: true,
  metadataMinScore: 0.35,
  importProgressThrottle: 3,
  discordPresenceEnabled: true,
}

const appSettingsSchema = z.object({
  mpvPath: z.string(),
  ytdlpPath: z.string(),
  playbackVolume: z.number().int().min(0).max(100),
  resolverTimeoutMs: z.number().int().positive(),
  cacheTtlHours: z.number().int().positive(),
  streamCacheTtlMinutes: z.number().int().positive(),
  importMaxTracks: z.number().int().min(1).max(500),
  importMatchConcurrency: z.number().int().min(1).max(16),
  spotifyMatchScoreThreshold: z.number().min(0).max(1),
  metadataEnrichmentEnabled: z.boolean(),
  metadataMinScore: z.number().min(0).max(1),
  importProgressThrottle: z.number().int().min(1).max(100),
  discordPresenceEnabled: z.boolean(),
})

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

function now(): number {
  return Date.now()
}

export class SettingsRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  get(): AppSettings {
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
    return result.success ? result.data : defaultSettings
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const next = { ...this.get(), ...patch }
    const timestamp = now()
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
    return next
  }
}

export class LibraryRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  upsertTrack(candidate: TrackCandidate): Track {
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
        candidate.title.trim() && candidate.title !== "Untitled track" ? candidate.title : row.title
      this.db
        .update(schema.tracks)
        .set({
          title,
          artist: candidate.artist ?? row.artist,
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
        album: null,
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
  }

  findTrackRowBySourceUrl(sourceUrl: string): DbTrack | undefined {
    const result = this.db
      .select({
        id: schema.tracks.id,
        title: schema.tracks.title,
        artist: schema.tracks.artist,
        album: schema.tracks.album,
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
      })
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
      .select({
        id: schema.tracks.id,
        title: schema.tracks.title,
        artist: schema.tracks.artist,
        album: schema.tracks.album,
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
      })
      .from(schema.tracks)
      .innerJoin(schema.trackSources, eq(schema.trackSources.trackId, schema.tracks.id))
      .where(
        and(eq(schema.trackSources.provider, provider), eq(schema.trackSources.sourceId, sourceId))
      )
      .get()
    return result
  }

  getTrack(trackId: string): Track | null {
    const row = this.db.select().from(schema.tracks).where(eq(schema.tracks.id, trackId)).get()
    return row ? mapTrack(row) : null
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
        } catch {
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
        .select({
          playlistId: schema.playlistTracks.playlistId,
          playlistEntryId: schema.playlistTracks.id,
          addedAt: schema.playlistTracks.addedAt,
          id: schema.tracks.id,
          title: schema.tracks.title,
          artist: schema.tracks.artist,
          album: schema.tracks.album,
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
        })
        .from(schema.playlistTracks)
        .innerJoin(schema.tracks, eq(schema.tracks.id, schema.playlistTracks.trackId))
        .where(inArray(schema.playlistTracks.playlistId, playlistIds))
        .orderBy(asc(schema.playlistTracks.sortOrder), asc(schema.playlistTracks.addedAt))
        .all()

      for (const row of trackRows) {
        const list = tracksByPlaylist.get(row.playlistId) ?? []
        list.push({
          id: row.id,
          title: row.title,
          artist: row.artist,
          album: row.album,
          durationMs: row.durationMs,
          thumbnailUrl: row.thumbnailUrl,
          canonicalUrl: row.canonicalUrl,
          provider: row.provider as Provider,
          likedAt: row.likedAt,
          downloadStatus: row.downloadStatus as DownloadStatus,
          downloadProgress: row.downloadProgress,
          downloadedFilePath: row.downloadedFilePath,
          downloadError: row.downloadError,
          downloadedAt: row.downloadedAt,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
          playlistEntryId: row.playlistEntryId,
          addedAt: row.addedAt,
        })
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

  createPlaylist(name: string): Playlist[] {
    this.createPlaylistRecord(name)
    return this.listPlaylists()
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
      return this.listPlaylists()
    }
    this.db
      .update(schema.playlists)
      .set({ name: name.trim(), updatedAt: now() })
      .where(eq(schema.playlists.id, playlistId))
      .run()
    return this.listPlaylists()
  }

  deletePlaylist(playlistId: string): Playlist[] {
    if (playlistId === LIKED_SONGS_PLAYLIST_ID || playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      return this.listPlaylists()
    }
    this.db.delete(schema.playlists).where(eq(schema.playlists.id, playlistId)).run()
    return this.listPlaylists()
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
    ids.splice(from, 1)
    ids.splice(clamped, 0, entryId)
    for (let i = 0; i < ids.length; i++) {
      this.db
        .update(schema.playlistTracks)
        .set({ sortOrder: i })
        .where(eq(schema.playlistTracks.id, ids[i]))
        .run()
    }
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
    const tracks = this.listLikedTracks()
    const createdAt = tracks[tracks.length - 1]?.likedAt ?? 0
    const updatedAt = tracks[0]?.likedAt ?? createdAt
    return {
      id: LIKED_SONGS_PLAYLIST_ID,
      name: "Liked Songs",
      description: "Songs you have hearted in Loopify.",
      sortOrder: -1,
      createdAt,
      updatedAt,
      isSystem: true,
      totalDurationMs: sumDurationMs(tracks),
      tracks,
    }
  }

  private getOfflineSongsPlaylist(): Playlist {
    const tracks = this.listDownloadedTracks()
    const t0 = tracks[0]
    const tLast = tracks[tracks.length - 1]
    const createdAt = tLast?.downloadedAt ?? tLast?.updatedAt ?? 0
    const updatedAt = t0?.downloadedAt ?? t0?.updatedAt ?? createdAt
    return {
      id: OFFLINE_SONGS_PLAYLIST_ID,
      name: "Offline songs",
      description: "Music stored on this device for offline playback.",
      sortOrder: 0,
      createdAt,
      updatedAt,
      isSystem: true,
      totalDurationMs: sumDurationMs(tracks),
      tracks,
    }
  }

  private normalizePlaylistTrackSortOrders(playlistId: string): void {
    const rows = this.db
      .select({ id: schema.playlistTracks.id })
      .from(schema.playlistTracks)
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.sortOrder), asc(schema.playlistTracks.addedAt))
      .all()
    for (let i = 0; i < rows.length; i++) {
      this.db
        .update(schema.playlistTracks)
        .set({ sortOrder: i })
        .where(eq(schema.playlistTracks.id, rows[i].id))
        .run()
    }
  }

  private listPlaylistTracks(playlistId: string): PlaylistTrackItem[] {
    const rows = this.db
      .select({
        playlistEntryId: schema.playlistTracks.id,
        addedAt: schema.playlistTracks.addedAt,
        id: schema.tracks.id,
        title: schema.tracks.title,
        artist: schema.tracks.artist,
        album: schema.tracks.album,
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
      })
      .from(schema.playlistTracks)
      .innerJoin(schema.tracks, eq(schema.tracks.id, schema.playlistTracks.trackId))
      .where(eq(schema.playlistTracks.playlistId, playlistId))
      .orderBy(asc(schema.playlistTracks.sortOrder), asc(schema.playlistTracks.addedAt))
      .all()
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationMs: row.durationMs,
      thumbnailUrl: row.thumbnailUrl,
      canonicalUrl: row.canonicalUrl,
      provider: row.provider as Provider,
      likedAt: row.likedAt,
      downloadStatus: row.downloadStatus as DownloadStatus,
      downloadProgress: row.downloadProgress,
      downloadedFilePath: row.downloadedFilePath,
      downloadError: row.downloadError,
      downloadedAt: row.downloadedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      playlistEntryId: row.playlistEntryId,
      addedAt: row.addedAt,
    }))
  }

  private listLikedTracks(): PlaylistTrackItem[] {
    const rows = this.db
      .select({
        playlistEntryId: sql<string>`'liked_' || ${schema.tracks.id}`,
        addedAt: schema.tracks.likedAt,
        id: schema.tracks.id,
        title: schema.tracks.title,
        artist: schema.tracks.artist,
        album: schema.tracks.album,
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
      })
      .from(schema.tracks)
      .where(isNotNull(schema.tracks.likedAt))
      .orderBy(desc(schema.tracks.likedAt), desc(schema.tracks.createdAt))
      .all()
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationMs: row.durationMs,
      thumbnailUrl: row.thumbnailUrl,
      canonicalUrl: row.canonicalUrl,
      provider: row.provider as Provider,
      likedAt: row.likedAt,
      downloadStatus: row.downloadStatus as DownloadStatus,
      downloadProgress: row.downloadProgress,
      downloadedFilePath: row.downloadedFilePath,
      downloadError: row.downloadError,
      downloadedAt: row.downloadedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      playlistEntryId: row.playlistEntryId,
      addedAt: row.addedAt ?? 0,
    }))
  }

  private listDownloadedTracks(): PlaylistTrackItem[] {
    const rows = this.db
      .select({
        playlistEntryId: sql<string>`'offline_' || ${schema.tracks.id}`,
        addedAt: sql<number>`coalesce(${schema.tracks.downloadedAt}, ${schema.tracks.updatedAt})`,
        id: schema.tracks.id,
        title: schema.tracks.title,
        artist: schema.tracks.artist,
        album: schema.tracks.album,
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
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      artist: row.artist,
      album: row.album,
      durationMs: row.durationMs,
      thumbnailUrl: row.thumbnailUrl,
      canonicalUrl: row.canonicalUrl,
      provider: row.provider as Provider,
      likedAt: row.likedAt,
      downloadStatus: row.downloadStatus as DownloadStatus,
      downloadProgress: row.downloadProgress,
      downloadedFilePath: row.downloadedFilePath,
      downloadError: row.downloadError,
      downloadedAt: row.downloadedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      playlistEntryId: row.playlistEntryId,
      addedAt: row.addedAt ?? 0,
    }))
  }
}

export class QueueRepository {
  constructor(private readonly db: BetterSQLite3Database<typeof schema>) {}

  list(): QueueItem[] {
    const rows = this.db
      .select({
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
      })
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
    ids.splice(from, 1)
    ids.splice(clamped, 0, queueItemId)
    for (let i = 0; i < ids.length; i++) {
      this.db
        .update(schema.queueItems)
        .set({ sortOrder: i })
        .where(eq(schema.queueItems.id, ids[i]))
        .run()
    }
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

    for (let i = 0; i < ids.length; i++) {
      this.db
        .update(schema.queueItems)
        .set({ sortOrder: i })
        .where(eq(schema.queueItems.id, ids[i]))
        .run()
    }
    return this.list()
  }

  clear(): QueueItem[] {
    this.db.delete(schema.queueItems).run()
    return []
  }

  get(queueItemId: string): QueueItem | null {
    const row = this.db
      .select({
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
      })
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
    const existing = this.db
      .select({ id: schema.resolverCache.id })
      .from(schema.resolverCache)
      .where(eq(schema.resolverCache.sourceUrl, sourceUrl))
      .get()
    const idValue = existing?.id ?? id("rc")
    this.db
      .insert(schema.resolverCache)
      .values({
        id: idValue,
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
        target: schema.resolverCache.id,
        set: {
          sourceUrl,
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
    const result = mapLyricsCache(row)
    if (result === null) {
      this.db.delete(schema.lyricsCache).where(eq(schema.lyricsCache.id, cacheKey)).run()
    }
    return result
  }

  set(input: LyricsCacheInput): LyricsState {
    const { state } = input
    const lyrics = state.status === "synced" || state.status === "static" ? state.lyrics : null
    this.db
      .insert(schema.lyricsCache)
      .values({
        id: input.id,
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
      })
      .onConflictDoUpdate({
        target: schema.lyricsCache.id,
        set: {
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
        },
      })
      .run()
    return state
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
