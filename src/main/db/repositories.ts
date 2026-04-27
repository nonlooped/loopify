import { randomUUID } from "node:crypto"
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
import type { DatabaseConnection } from "./database"

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
  communityLyricsFallbackEnabled: false,
}

const NUMERIC_SETTINGS = new Set<keyof AppSettings>([
  "playbackVolume",
  "resolverTimeoutMs",
  "cacheTtlHours",
  "streamCacheTtlMinutes",
  "importMaxTracks",
  "importMatchConcurrency",
  "spotifyMatchScoreThreshold",
  "metadataMinScore",
  "importProgressThrottle",
])

const BOOLEAN_SETTINGS = new Set<keyof AppSettings>([
  "metadataEnrichmentEnabled",
  "discordPresenceEnabled",
  "communityLyricsFallbackEnabled",
])

function id(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

function now(): number {
  return Date.now()
}

export class SettingsRepository {
  constructor(private readonly db: DatabaseConnection) {}

  get(): AppSettings {
    const rows = this.db.prepare("select key, value from settings").all() as {
      key: keyof AppSettings
      value: string
    }[]
    const settings = { ...defaultSettings }
    for (const row of rows) {
      if (NUMERIC_SETTINGS.has(row.key)) {
        const n = Number(row.value)
        if (Number.isFinite(n)) {
          ;(settings as Record<string, unknown>)[row.key] = n
        }
      } else if (BOOLEAN_SETTINGS.has(row.key)) {
        ;(settings as Record<string, unknown>)[row.key] = row.value === "true"
      } else {
        ;(settings as Record<string, unknown>)[row.key] = row.value
      }
    }
    return settings
  }

  update(patch: Partial<AppSettings>): AppSettings {
    const stmt = this.db.prepare(
      "insert into settings (key, value, updated_at) values (?, ?, ?) on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at"
    )
    const next = { ...this.get(), ...patch }
    const timestamp = now()
    for (const [key, value] of Object.entries(next)) {
      stmt.run(key, String(value), timestamp)
    }
    return next
  }
}

export class LibraryRepository {
  constructor(private readonly db: DatabaseConnection) {}

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
          .prepare("select 1 from track_sources where track_id = ? and source_url = ?")
          .get(targetId, candidate.sourceUrl) as { 1: number } | undefined
        if (!hasSourceUrl) {
          this.db
            .prepare(
              "insert into track_sources (id, track_id, provider, source_url, source_id, extractor, last_resolved_at, last_status) values (?, ?, ?, ?, ?, ?, ?, ?)"
            )
            .run(
              id("src"),
              targetId,
              candidate.provider,
              candidate.sourceUrl,
              candidate.sourceId,
              candidate.extractor,
              timestamp,
              "ready"
            )
        }
      }
      const title =
        candidate.title.trim() && candidate.title !== "Untitled track" ? candidate.title : row.title
      this.db
        .prepare(
          "update tracks set title = ?, artist = coalesce(?, artist), duration_ms = coalesce(?, duration_ms), thumbnail_url = coalesce(?, thumbnail_url), canonical_url = ?, provider = ?, updated_at = ? where id = ?"
        )
        .run(
          title,
          candidate.artist,
          candidate.durationMs,
          candidate.thumbnailUrl,
          candidate.canonicalUrl,
          candidate.provider,
          timestamp,
          targetId
        )
      this.db
        .prepare(
          "update track_sources set source_id = coalesce(?, source_id), extractor = coalesce(?, extractor), last_resolved_at = ?, last_status = ? where source_url = ?"
        )
        .run(candidate.sourceId, candidate.extractor, timestamp, "ready", candidate.sourceUrl)
      const updated = this.getTrack(targetId)
      if (!updated) {
        throw new Error(`Expected track ${targetId} after upsert`)
      }
      return updated
    }

    const trackId = id("trk")
    this.db
      .prepare(
        "insert into tracks (id, title, artist, album, duration_ms, thumbnail_url, canonical_url, provider, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        trackId,
        candidate.title,
        candidate.artist,
        null,
        candidate.durationMs,
        candidate.thumbnailUrl,
        candidate.canonicalUrl,
        candidate.provider,
        timestamp,
        timestamp
      )
    this.db
      .prepare(
        "insert into track_sources (id, track_id, provider, source_url, source_id, extractor, last_resolved_at, last_status) values (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        id("src"),
        trackId,
        candidate.provider,
        candidate.sourceUrl,
        candidate.sourceId,
        candidate.extractor,
        timestamp,
        "ready"
      )
    const created = this.getTrack(trackId)
    if (!created) {
      throw new Error(`Expected track ${trackId} after insert`)
    }
    return created
  }

  findTrackRowBySourceUrl(sourceUrl: string): DbTrack | undefined {
    return this.db
      .prepare(
        "select t.* from tracks t join track_sources s on s.track_id = t.id where s.source_url = ?"
      )
      .get(sourceUrl) as DbTrack | undefined
  }

  findTrackRowByCanonicalUrl(canonicalUrl: string): DbTrack | undefined {
    return this.db.prepare("select * from tracks where canonical_url = ?").get(canonicalUrl) as
      | DbTrack
      | undefined
  }

  findTrackRowByProviderSourceId(provider: Provider, sourceId: string): DbTrack | undefined {
    return this.db
      .prepare(
        "select t.* from tracks t join track_sources s on s.track_id = t.id where s.provider = ? and s.source_id = ?"
      )
      .get(provider, sourceId) as DbTrack | undefined
  }

  getTrack(trackId: string): Track | null {
    const row = this.db.prepare("select * from tracks where id = ?").get(trackId) as
      | DbTrack
      | undefined
    return row ? mapTrack(row) : null
  }

  listPlaylists(): Playlist[] {
    const rows = this.db
      .prepare("select * from playlists order by sort_order asc, created_at asc")
      .all() as DbPlaylist[]
    return [
      this.getLikedSongsPlaylist(),
      this.getOfflineSongsPlaylist(),
      ...rows.map((row) => {
        const tracks = this.listPlaylistTracks(row.id)
        return {
          id: row.id,
          name: row.name,
          description: row.description,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
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
      .prepare(
        "insert into playlists (id, name, description, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?, ?)"
      )
      .run(playlistId, playlistName, null, timestamp, timestamp, timestamp)
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
      .prepare("update playlists set name = ?, updated_at = ? where id = ?")
      .run(name.trim(), now(), playlistId)
    return this.listPlaylists()
  }

  deletePlaylist(playlistId: string): Playlist[] {
    if (playlistId === LIKED_SONGS_PLAYLIST_ID || playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      return this.listPlaylists()
    }
    this.db.prepare("delete from playlists where id = ?").run(playlistId)
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
    const count = this.db
      .prepare("select count(*) as count from playlist_tracks where playlist_id = ?")
      .get(playlistId) as { count: number }
    this.db
      .prepare(
        "insert into playlist_tracks (id, playlist_id, track_id, sort_order, added_at, added_from) values (?, ?, ?, ?, ?, ?)"
      )
      .run(id("pt"), playlistId, trackId, count.count, timestamp, sourceUrl)
    this.normalizePlaylistTrackSortOrders(playlistId)
    this.db.prepare("update playlists set updated_at = ? where id = ?").run(timestamp, playlistId)
  }

  removeTrackFromPlaylist(playlistId: string, entryId: string): Playlist[] {
    if (isSystemPlaylistId(playlistId)) {
      throw new Error(
        "Songs in system playlists are managed automatically. They cannot be removed with the playlist remove action."
      )
    }
    this.db
      .prepare("delete from playlist_tracks where id = ? and playlist_id = ?")
      .run(entryId, playlistId)
    this.normalizePlaylistTrackSortOrders(playlistId)
    this.db.prepare("update playlists set updated_at = ? where id = ?").run(now(), playlistId)
    return this.listPlaylists()
  }

  moveTrackInPlaylist(playlistId: string, entryId: string, newIndex: number): Playlist[] {
    if (playlistId === LIKED_SONGS_PLAYLIST_ID || playlistId === OFFLINE_SONGS_PLAYLIST_ID) {
      return this.listPlaylists()
    }
    const rows = this.db
      .prepare(
        "select id from playlist_tracks where playlist_id = ? order by sort_order asc, added_at asc"
      )
      .all(playlistId) as { id: string }[]
    const ids = rows.map((r) => r.id)
    const from = ids.indexOf(entryId)
    if (from < 0) {
      return this.listPlaylists()
    }
    const clamped = Math.max(0, Math.min(newIndex, ids.length - 1))
    ids.splice(from, 1)
    ids.splice(clamped, 0, entryId)
    const update = this.db.prepare("update playlist_tracks set sort_order = ? where id = ?")
    for (let i = 0; i < ids.length; i++) {
      update.run(i, ids[i])
    }
    this.db.prepare("update playlists set updated_at = ? where id = ?").run(now(), playlistId)
    return this.listPlaylists()
  }

  setTrackLiked(trackId: string, liked: boolean): Track {
    const timestamp = now()
    this.db
      .prepare("update tracks set liked_at = ?, updated_at = ? where id = ?")
      .run(liked ? timestamp : null, timestamp, trackId)
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
      .prepare(
        `update tracks set
          download_status = ?,
          download_progress = ?,
          downloaded_file_path = ?,
          download_error = ?,
          downloaded_at = ?,
          updated_at = ?
        where id = ?`
      )
      .run(
        input.status,
        input.progress,
        input.filePath === undefined ? existing.downloadedFilePath : input.filePath,
        input.error === undefined ? existing.downloadError : input.error,
        input.downloadedAt === undefined ? existing.downloadedAt : input.downloadedAt,
        now(),
        trackId
      )
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
      .prepare(
        "select id from playlist_tracks where playlist_id = ? order by sort_order asc, added_at asc"
      )
      .all(playlistId) as { id: string }[]
    const update = this.db.prepare("update playlist_tracks set sort_order = ? where id = ?")
    for (let i = 0; i < rows.length; i++) {
      update.run(i, rows[i].id)
    }
  }

  private listPlaylistTracks(playlistId: string): PlaylistTrackItem[] {
    const rows = this.db
      .prepare(
        `select pt.id as playlist_entry_id,
          pt.added_at,
          t.id, t.title, t.artist, t.album, t.duration_ms, t.thumbnail_url, t.canonical_url, t.provider,
          t.liked_at, t.download_status, t.download_progress, t.downloaded_file_path, t.download_error, t.downloaded_at,
          t.created_at, t.updated_at
        from playlist_tracks pt
        join tracks t on t.id = pt.track_id
        where pt.playlist_id = ?
        order by pt.sort_order asc, pt.added_at asc`
      )
      .all(playlistId) as (DbTrack & { playlist_entry_id: string; added_at: number })[]
    return rows.map(mapPlaylistTrackRow)
  }

  private listLikedTracks(): PlaylistTrackItem[] {
    const rows = this.db
      .prepare(
        `select
          'liked_' || id as playlist_entry_id,
          liked_at as added_at,
          *
        from tracks
        where liked_at is not null
        order by liked_at desc, created_at desc`
      )
      .all() as (DbTrack & { playlist_entry_id: string; added_at: number })[]
    return rows.map(mapPlaylistTrackRow)
  }

  private listDownloadedTracks(): PlaylistTrackItem[] {
    const rows = this.db
      .prepare(
        `select
          'offline_' || id as playlist_entry_id,
          coalesce(downloaded_at, updated_at) as added_at,
          *
        from tracks
        where download_status = 'downloaded' and coalesce(trim(downloaded_file_path), '') != ''
        order by coalesce(downloaded_at, updated_at) desc, created_at desc`
      )
      .all() as (DbTrack & { playlist_entry_id: string; added_at: number })[]
    return rows.map(mapPlaylistTrackRow)
  }
}

export class QueueRepository {
  constructor(
    private readonly db: DatabaseConnection,
    private readonly library: LibraryRepository
  ) {}

  list(): QueueItem[] {
    const rows = this.db
      .prepare("select * from queue_items order by sort_order asc, created_at asc")
      .all() as DbQueueItem[]
    return rows.map((row) => ({
      id: row.id,
      trackId: row.track_id,
      sourceUrl: row.source_url,
      sortOrder: row.sort_order,
      status: row.status as QueueItem["status"],
      createdAt: row.created_at,
      track: row.track_id ? this.library.getTrack(row.track_id) : null,
    }))
  }

  add(sourceUrl: string, trackId: string | null = null): QueueItem[] {
    const maxSortOrder = this.db
      .prepare("select coalesce(max(sort_order), -1) as sortOrder from queue_items")
      .get() as { sortOrder: number }
    this.db
      .prepare(
        "insert into queue_items (id, track_id, source_url, sort_order, status, created_at) values (?, ?, ?, ?, ?, ?)"
      )
      .run(
        id("q"),
        trackId,
        sourceUrl,
        maxSortOrder.sortOrder + 1,
        trackId ? "ready" : "queued",
        now()
      )
    return this.list()
  }

  setTrack(queueItemId: string, trackId: string, status: QueueItem["status"]): void {
    this.db
      .prepare("update queue_items set track_id = ?, status = ? where id = ?")
      .run(trackId, status, queueItemId)
  }

  setStatus(queueItemId: string, status: QueueItem["status"]): void {
    this.db.prepare("update queue_items set status = ? where id = ?").run(status, queueItemId)
  }

  clearPlaying(): void {
    this.db
      .prepare(
        "update queue_items set status = case when track_id is null then 'queued' else 'ready' end where status = 'playing'"
      )
      .run()
  }

  trimBefore(queueItemId: string): QueueItem[] {
    this.db
      .prepare(
        "delete from queue_items where sort_order < (select sort_order from queue_items where id = ?)"
      )
      .run(queueItemId)
    return this.list()
  }

  remove(queueItemId: string): QueueItem[] {
    this.db.prepare("delete from queue_items where id = ?").run(queueItemId)
    return this.list()
  }

  move(queueItemId: string, sortOrder: number): QueueItem[] {
    const rows = this.db
      .prepare("select id from queue_items order by sort_order asc, created_at asc")
      .all() as { id: string }[]
    const ids = rows.map((row) => row.id)
    const from = ids.indexOf(queueItemId)
    if (from < 0) {
      return this.list()
    }
    const clamped = Math.max(0, Math.min(sortOrder, ids.length - 1))
    ids.splice(from, 1)
    ids.splice(clamped, 0, queueItemId)
    const update = this.db.prepare("update queue_items set sort_order = ? where id = ?")
    for (let i = 0; i < ids.length; i++) {
      update.run(i, ids[i])
    }
    return this.list()
  }

  /**
   * Randomizes queue order. When `anchorQueueItemId` is set (e.g. the item now playing),
   * that item stays first and only the rest are shuffled so playback is not interrupted.
   */
  shuffle(anchorQueueItemId: string | null): QueueItem[] {
    const rows = this.db
      .prepare("select id from queue_items order by sort_order asc, created_at asc")
      .all() as { id: string }[]
    if (rows.length <= 1) {
      return this.list()
    }

    let ids = rows.map((r) => r.id)
    if (anchorQueueItemId) {
      const anchorIndex = ids.indexOf(anchorQueueItemId)
      if (anchorIndex >= 0) {
        const [anchor] = ids.splice(anchorIndex, 1)
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
        ids = [anchor, ...ids]
      } else {
        for (let i = ids.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[ids[i], ids[j]] = [ids[j], ids[i]]
        }
      }
    } else {
      for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[ids[i], ids[j]] = [ids[j], ids[i]]
      }
    }

    const stmt = this.db.prepare("update queue_items set sort_order = ? where id = ?")
    for (let i = 0; i < ids.length; i++) {
      stmt.run(i, ids[i])
    }
    return this.list()
  }

  clear(): QueueItem[] {
    this.db.prepare("delete from queue_items").run()
    return []
  }

  get(queueItemId: string): QueueItem | null {
    return this.list().find((item) => item.id === queueItemId) ?? null
  }

  /** Next queue item in sort order, or `null` if `afterId` is last / missing. */
  nextItemId(afterId: string): string | null {
    const list = this.list()
    const index = list.findIndex((item) => item.id === afterId)
    if (index < 0) {
      return null
    }
    const next = list[index + 1]
    return next?.id ?? null
  }
}

export class ResolverCacheRepository {
  constructor(private readonly db: DatabaseConnection) {}

  getFresh(
    sourceUrl: string
  ): { candidate: TrackCandidate; streamUrl: string | null; expiresAt: number | null } | null {
    const row = this.db
      .prepare("select * from resolver_cache where source_url = ? order by updated_at desc limit 1")
      .get(sourceUrl) as DbResolverCache | undefined

    if (!row?.metadata_json) {
      return null
    }

    const t = now()
    const metadataFresh = row.expires_at === null || row.expires_at > t
    if (!metadataFresh) {
      return null
    }

    try {
      const candidate = JSON.parse(row.metadata_json) as TrackCandidate
      const streamTtl = row.stream_expires_at
      const streamValid =
        row.stream_url && (streamTtl === null || streamTtl === undefined || streamTtl > t)
      return {
        candidate,
        streamUrl: streamValid ? row.stream_url : null,
        expiresAt: row.expires_at,
      }
    } catch {
      this.db.prepare("delete from resolver_cache where id = ?").run(row.id)
      return null
    }
  }

  setResolved(
    sourceUrl: string,
    resolved: {
      candidate: TrackCandidate
      streamUrl: string | null
      /** Metadata / candidate cache expiry (e.g. hours). */
      expiresAt: number | null
      /** Stream URL expiry; omit to clear stream slot. */
      streamExpiresAt: number | null
    }
  ): void {
    const timestamp = now()
    const existing = this.db
      .prepare("select id from resolver_cache where source_url = ?")
      .get(sourceUrl) as { id: string } | undefined
    const idValue = existing?.id ?? id("rc")
    this.db
      .prepare(
        "insert into resolver_cache (id, source_url, provider, stream_url, metadata_json, expires_at, stream_expires_at, failure_code, failure_message, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, null, null, ?, ?) on conflict(id) do update set source_url = excluded.source_url, provider = excluded.provider, stream_url = excluded.stream_url, metadata_json = excluded.metadata_json, expires_at = excluded.expires_at, stream_expires_at = excluded.stream_expires_at, failure_code = null, failure_message = null, updated_at = excluded.updated_at"
      )
      .run(
        idValue,
        sourceUrl,
        resolved.candidate.provider,
        resolved.streamUrl,
        JSON.stringify(resolved.candidate),
        resolved.expiresAt,
        resolved.streamExpiresAt,
        existing ? timestamp : timestamp,
        timestamp
      )
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
  constructor(private readonly db: DatabaseConnection) {}

  get(cacheKey: string): LyricsState | null {
    const row = this.db.prepare("select * from lyrics_cache where id = ?").get(cacheKey) as
      | DbLyricsCache
      | undefined
    if (!row) {
      return null
    }
    if (row.status === "synced" && row.synced_lyrics_json) {
      try {
        return {
          status: "synced",
          reason: null,
          lyrics: {
            source: "cache",
            providerTrackId: row.provider_track_id,
            fetchedAt: row.fetched_at,
            lines: JSON.parse(row.synced_lyrics_json),
          },
        }
      } catch {
        this.db.prepare("delete from lyrics_cache where id = ?").run(cacheKey)
        return null
      }
    }
    if (row.status === "static" && row.synced_lyrics_json) {
      try {
        return {
          status: "static",
          reason: null,
          lyrics: {
            source: "cache",
            providerTrackId: row.provider_track_id,
            fetchedAt: row.fetched_at,
            text: JSON.parse(row.synced_lyrics_json),
          },
        }
      } catch {
        this.db.prepare("delete from lyrics_cache where id = ?").run(cacheKey)
        return null
      }
    }

    return {
      status: row.status as Exclude<LyricsState["status"], "synced" | "static">,
      lyrics: null,
      reason: row.error_message ?? "No synced lyrics are available for this track.",
    }
  }

  set(input: LyricsCacheInput): LyricsState {
    const { state } = input
    const lyrics = state.status === "synced" || state.status === "static" ? state.lyrics : null
    this.db
      .prepare(
        `insert into lyrics_cache (
          id, track_title, artist, album, duration_ms, canonical_url, provider,
          status, source, provider_track_id, synced_lyrics_json, error_message, fetched_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          track_title = excluded.track_title,
          artist = excluded.artist,
          album = excluded.album,
          duration_ms = excluded.duration_ms,
          canonical_url = excluded.canonical_url,
          provider = excluded.provider,
          status = excluded.status,
          source = excluded.source,
          provider_track_id = excluded.provider_track_id,
          synced_lyrics_json = excluded.synced_lyrics_json,
          error_message = excluded.error_message,
          fetched_at = excluded.fetched_at`
      )
      .run(
        input.id,
        input.trackTitle,
        input.artist,
        input.album,
        input.durationMs,
        input.canonicalUrl,
        input.provider,
        state.status,
        lyrics?.source ?? null,
        lyrics?.providerTrackId ?? null,
        lyrics ? JSON.stringify("lines" in lyrics ? lyrics.lines : lyrics.text) : null,
        state.reason,
        lyrics?.fetchedAt ?? now()
      )
    return state
  }
}

export class ImportRepository {
  constructor(private readonly db: DatabaseConnection) {}

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
      .prepare(
        "insert into imports (id, input_url, target_playlist_id, playlist_title, status, phase, source_kind, total, completed, failed, matched, skipped, truncated, source_track_count, created_at, finished_at, error_message) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        job.id,
        job.inputUrl,
        job.targetPlaylistId,
        job.playlistTitle,
        job.status,
        job.phase,
        job.sourceKind,
        job.total,
        job.completed,
        job.failed,
        job.matched,
        job.skipped,
        job.truncated ? 1 : 0,
        job.sourceTrackCount,
        job.createdAt,
        job.finishedAt,
        job.errorMessage
      )
    return job
  }

  update(job: ImportJob): ImportJob {
    this.db
      .prepare(
        "update imports set target_playlist_id = ?, playlist_title = ?, status = ?, phase = ?, source_kind = ?, total = ?, completed = ?, failed = ?, matched = ?, skipped = ?, truncated = ?, source_track_count = ?, finished_at = ?, error_message = ? where id = ?"
      )
      .run(
        job.targetPlaylistId,
        job.playlistTitle,
        job.status,
        job.phase,
        job.sourceKind,
        job.total,
        job.completed,
        job.failed,
        job.matched,
        job.skipped,
        job.truncated ? 1 : 0,
        job.sourceTrackCount,
        job.finishedAt,
        job.errorMessage,
        job.id
      )
    return job
  }

  get(importId: string): ImportJob | null {
    const row = this.db.prepare("select * from imports where id = ?").get(importId) as
      | DbImport
      | undefined
    if (!row) return null
    return mapImportRow(row)
  }
}

type DbTrack = {
  id: string
  title: string
  artist: string | null
  album: string | null
  duration_ms: number | null
  thumbnail_url: string | null
  canonical_url: string
  provider: Provider
  liked_at?: number | null
  download_status?: string | null
  download_progress?: number | null
  downloaded_file_path?: string | null
  download_error?: string | null
  downloaded_at?: number | null
  created_at: number
  updated_at: number
}

type DbPlaylist = {
  id: string
  name: string
  description: string | null
  sort_order: number
  created_at: number
  updated_at: number
}

type DbQueueItem = {
  id: string
  track_id: string | null
  source_url: string
  sort_order: number
  status: string
  created_at: number
}

type DbImport = {
  id: string
  input_url: string
  target_playlist_id: string | null
  playlist_title: string | null
  status: string
  phase?: string
  source_kind?: string | null
  total: number
  completed: number
  failed: number
  matched?: number
  skipped?: number
  truncated?: number
  source_track_count?: number | null
  created_at: number
  finished_at: number | null
  error_message: string | null
}

type DbResolverCache = {
  id: string
  source_url: string
  provider: Provider
  stream_url: string | null
  metadata_json: string | null
  expires_at: number | null
  stream_expires_at: number | null
  failure_code: string | null
  failure_message: string | null
  created_at: number
  updated_at: number
}

type DbLyricsCache = {
  id: string
  track_title: string
  artist: string | null
  album: string | null
  duration_ms: number | null
  canonical_url: string
  provider: Provider
  status: string
  source: string | null
  provider_track_id: string | null
  synced_lyrics_json: string | null
  error_message: string | null
  fetched_at: number
}

function mapImportRow(row: DbImport): ImportJob {
  return {
    id: row.id,
    inputUrl: row.input_url,
    targetPlaylistId: row.target_playlist_id,
    playlistTitle: row.playlist_title ?? null,
    status: row.status as ImportJob["status"],
    phase: (row.phase ?? "queued") as ImportJob["phase"],
    sourceKind: (row.source_kind as ImportJob["sourceKind"]) ?? null,
    total: row.total,
    completed: row.completed,
    failed: row.failed,
    matched: row.matched ?? 0,
    skipped: row.skipped ?? 0,
    truncated: row.truncated === 1,
    sourceTrackCount: row.source_track_count ?? null,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    errorMessage: row.error_message ?? null,
  }
}

function mapTrack(row: DbTrack): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    durationMs: row.duration_ms,
    thumbnailUrl: row.thumbnail_url,
    canonicalUrl: row.canonical_url,
    provider: row.provider,
    likedAt: row.liked_at ?? null,
    downloadStatus: normalizeDownloadStatus(row.download_status),
    downloadProgress: row.download_progress ?? 0,
    downloadedFilePath: row.downloaded_file_path ?? null,
    downloadError: row.download_error ?? null,
    downloadedAt: row.downloaded_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPlaylistTrackRow(
  row: DbTrack & { playlist_entry_id: string; added_at: number }
): PlaylistTrackItem {
  return { ...mapTrack(row), playlistEntryId: row.playlist_entry_id, addedAt: row.added_at }
}

function normalizeDownloadStatus(value: string | null | undefined): DownloadStatus {
  if (
    value === "queued" ||
    value === "downloading" ||
    value === "downloaded" ||
    value === "failed"
  ) {
    return value
  }
  return "not-downloaded"
}

function sumDurationMs(tracks: { durationMs: number | null }[]): number {
  return tracks.reduce((total, track) => total + (track.durationMs ?? 0), 0)
}
