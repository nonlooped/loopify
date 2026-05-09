export type Provider = "youtube" | "soundcloud" | "bandcamp" | "direct" | "unknown"

export const LIKED_SONGS_PLAYLIST_ID = "system_liked_songs"
export const OFFLINE_SONGS_PLAYLIST_ID = "system_offline_songs"

export function isSystemPlaylistId(id: string): boolean {
  return id === LIKED_SONGS_PLAYLIST_ID || id === OFFLINE_SONGS_PLAYLIST_ID
}

export type RepeatMode = "off" | "one" | "all"

export type DownloadStatus = "not-downloaded" | "queued" | "downloading" | "downloaded" | "failed"

export type Track = {
  id: string
  title: string
  artist: string | null
  album: string | null
  artistId: string | null
  albumId: string | null
  durationMs: number | null
  thumbnailUrl: string | null
  canonicalUrl: string
  provider: Provider
  likedAt: number | null
  downloadStatus: DownloadStatus
  downloadProgress: number
  downloadedFilePath: string | null
  downloadError: string | null
  downloadedAt: number | null
  createdAt: number
  updatedAt: number
}

export type TrackCandidate = {
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  thumbnailUrl: string | null
  sourceUrl: string
  canonicalUrl: string
  provider: Provider
  sourceId: string | null
  extractor: string | null
}

export type CatalogSearchResult =
  | { kind: "track"; track: CatalogTrack }
  | { kind: "artist"; artist: CatalogArtist }
  | { kind: "album"; album: CatalogAlbum }

export type CatalogArtist = {
  deezerId: number
  name: string
  pictureUrl: string | null
}

export type CatalogAlbum = {
  deezerId: number
  title: string
  artistName: string
  coverUrl: string | null
  trackCount: number
  albumType: string
}

export type ArtistDiscography = {
  artist: CatalogArtist
  topTracks: CatalogTrack[]
  albums: CatalogAlbum[]
  singles: CatalogAlbum[]
  compilations: CatalogAlbum[]
}

export type AlbumDetails = {
  album: CatalogAlbum
  tracks: CatalogTrack[]
}

/** A song-level result from the Deezer catalog. Distinct from TrackCandidate, which is
 *  source-resolved (has a playable provider URL). Catalog hits become candidates only after stage-2
 *  resolution finds an audio source for them. */
export type CatalogTrack = {
  catalogProvider: "deezer"
  catalogId: string
  title: string
  artist: string
  artistDeezerId?: number
  features: string[]
  album: string | null
  albumDeezerId?: number
  artworkUrl: string | null
  durationMs: number
  isrc: string | null
}

export type ResolvedTrack = {
  candidate: TrackCandidate
  streamUrl: string | null
  expiresAt: number | null
}

export type QueueItem = {
  id: string
  trackId: string | null
  sourceUrl: string
  sortOrder: number
  status: "queued" | "resolving" | "ready" | "playing" | "failed"
  createdAt: number
  track: Track | null
}

/** A track row inside a playlist (includes stable `playlistEntryId` for edits). */
export type PlaylistTrackItem = Track & {
  playlistEntryId: string
  addedAt: number
}

export type Playlist = {
  id: string
  name: string
  description: string | null
  sortOrder: number
  createdAt: number
  updatedAt: number
  isSystem?: boolean
  totalDurationMs: number
  /** When present without loading full `tracks`, used for sorting and playlist cards. */
  trackCount?: number
  tracks?: PlaylistTrackItem[]
}

type ImportPhase = "queued" | "fetching" | "matching" | "saving" | "done" | "failed"

export type ImportSourceKind = "youtube" | "spotify" | "other"

export type ImportJob = {
  id: string
  inputUrl: string
  targetPlaylistId: string | null
  /** Resolved source playlist title once the job has fetched metadata. */
  playlistTitle: string | null
  status: "queued" | "running" | "done" | "failed"
  /** Fine-grained step within the import pipeline. */
  phase: ImportPhase
  sourceKind: ImportSourceKind | null
  total: number
  completed: number
  failed: number
  /** Successful matches (e.g. Spotify row → track). */
  matched: number
  /** Rows skipped (e.g. no confident match for Spotify). */
  skipped: number
  /** True if source had more than `importMaxTracks` items. */
  truncated: boolean
  /** Source catalog size before capping. */
  sourceTrackCount: number | null
  createdAt: number
  finishedAt: number | null
  /** Set when the job ends in `failed` (e.g. resolver error). */
  errorMessage: string | null
}

export type PlayerPosition = {
  positionSeconds: number
  durationSeconds: number | null
  bufferedDuration: number
}

export type PlayerState = {
  status: "idle" | "loading" | "playing" | "paused" | "errored"
  queueItemId: string | null
  title: string | null
  track: PlayerTrack | null
  positionSeconds: number
  durationSeconds: number | null
  volume: number
  repeatMode?: RepeatMode
  error: string | null
}

export type PlayerTrack = {
  id?: string
  title: string
  artist: string | null
  album: string | null
  durationMs: number | null
  thumbnailUrl: string | null
  canonicalUrl: string
  provider: Provider
  likedAt?: number | null
  downloadStatus?: DownloadStatus
  downloadedFilePath?: string | null
}

export type SyncedLyricLine = {
  timeSeconds: number
  endTimeSeconds?: number
  text: string
}

type TrackLyrics = {
  source: "lrclib" | "cache"
  providerTrackId: string | null
  fetchedAt: number
  lines: SyncedLyricLine[]
}

type StaticTrackLyrics = {
  source: "lrclib" | "cache"
  providerTrackId: string | null
  fetchedAt: number
  text: string
}

export type LyricsState =
  | {
      status: "synced"
      lyrics: TrackLyrics
      reason: null
    }
  | {
      status: "static"
      lyrics: StaticTrackLyrics
      reason: null
    }
  | {
      status: "not-found" | "instrumental" | "error"
      lyrics: null
      reason: string
    }

export type AppSettings = {
  installationId: string
  mpvPath: string
  ytdlpPath: string
  playbackVolume: number
  resolverTimeoutMs: number
  /** TTL for display metadata in resolver cache (hours). */
  cacheTtlHours: number
  /** How long direct stream URLs are considered valid in cache (minutes). */
  streamCacheTtlMinutes: number
  /** Max tracks imported from a source playlist. */
  importMaxTracks: number
  /** Concurrent resolver operations during Spotify import matching. */
  importMatchConcurrency: number
  /** Minimum `trackMatchScore` to accept a Spotify → yt-dlp result. */
  spotifyMatchScoreThreshold: number
  /** Minimum match score to apply Deezer metadata (0–1). */
  deezerMatchThreshold: number
  /** Emit DB / IPC import update at most every N track completions. */
  importProgressThrottle: number
  /** Share active playback to Discord via Rich Presence. */
  discordPresenceEnabled: boolean
  /** Gate for recommendations UI and APIs. */
  recommendationsEnabled: boolean
  /** Percentage rollout (0-100) for recommendations. */
  recommendationsRolloutPercent: number
}
