import type { InferSelectModel } from "drizzle-orm"
import type {
  DownloadStatus,
  ImportJob,
  LyricsState,
  PlaylistTrackItem,
  Provider,
  QueueItem,
  Track,
  TrackCandidate,
} from "../../shared/types/music"
import type {
  albums,
  albumTracks,
  artists,
  importItems,
  imports,
  lyricsCache,
  playHistory,
  playlists,
  playlistTracks,
  queueItems,
  resolverCache,
  settings,
  trackSources,
  tracks,
} from "./schema"

export type DbArtist = InferSelectModel<typeof artists>
export type DbAlbum = InferSelectModel<typeof albums>
export type DbAlbumTrack = InferSelectModel<typeof albumTracks>
export type DbTrack = InferSelectModel<typeof tracks>
export type DbTrackSource = InferSelectModel<typeof trackSources>
export type DbPlaylist = InferSelectModel<typeof playlists>
export type DbPlaylistTrack = InferSelectModel<typeof playlistTracks>
export type DbQueueItem = InferSelectModel<typeof queueItems>
export type DbImport = InferSelectModel<typeof imports>
export type DbImportItem = InferSelectModel<typeof importItems>
export type DbPlayHistory = InferSelectModel<typeof playHistory>
export type DbLyricsCache = InferSelectModel<typeof lyricsCache>
export type DbSettings = InferSelectModel<typeof settings>
export type DbResolverCache = InferSelectModel<typeof resolverCache>

export function mapTrack(
  row: Omit<DbTrack, "downloadStatus"> & { downloadStatus?: string | null }
): Track {
  return {
    id: row.id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    artistId: row.artistId ?? null,
    albumId: row.albumId ?? null,
    durationMs: row.durationMs,
    thumbnailUrl: row.thumbnailUrl,
    canonicalUrl: row.canonicalUrl,
    provider: row.provider as Provider,
    likedAt: row.likedAt,
    downloadStatus: normalizeDownloadStatus(row.downloadStatus),
    downloadProgress: row.downloadProgress ?? 0,
    downloadedFilePath: row.downloadedFilePath,
    downloadError: row.downloadError,
    downloadedAt: row.downloadedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function mapPlaylistTrackRow(
  row: DbTrack & { playlistEntryId: string; addedAt: number },
  overrides?: { addedAt?: number }
): PlaylistTrackItem {
  return {
    ...mapTrack(row),
    playlistEntryId: row.playlistEntryId,
    addedAt: overrides?.addedAt ?? row.addedAt,
  }
}

export function mapQueueItem(
  row: DbQueueItem & {
    t_id: string | null
    t_title: string | null
    t_artist: string | null
    t_album: string | null
    t_artist_id: string | null
    t_album_id: string | null
    t_duration_ms: number | null
    t_thumbnail_url: string | null
    t_canonical_url: string | null
    t_provider: string | null
    t_liked_at: number | null
    t_download_status: string | null
    t_download_progress: number | null
    t_downloaded_file_path: string | null
    t_download_error: string | null
    t_downloaded_at: number | null
    t_created_at: number | null
    t_updated_at: number | null
  }
): QueueItem {
  const track = row.t_id
    ? mapTrack({
        id: row.t_id,
        title: row.t_title ?? "",
        artist: row.t_artist,
        album: row.t_album,
        artistId: row.t_artist_id,
        albumId: row.t_album_id,
        durationMs: row.t_duration_ms,
        thumbnailUrl: row.t_thumbnail_url,
        canonicalUrl: row.t_canonical_url ?? "",
        provider: (row.t_provider ?? "unknown") as Provider,
        likedAt: row.t_liked_at,
        downloadStatus: row.t_download_status,
        downloadProgress: row.t_download_progress ?? 0,
        downloadedFilePath: row.t_downloaded_file_path,
        downloadError: row.t_download_error,
        downloadedAt: row.t_downloaded_at,
        createdAt: row.t_created_at ?? 0,
        updatedAt: row.t_updated_at ?? 0,
      })
    : null

  return {
    id: row.id,
    trackId: row.trackId,
    sourceUrl: row.sourceUrl,
    sortOrder: row.sortOrder,
    status: row.status as QueueItem["status"],
    createdAt: row.createdAt,
    track,
  }
}

export function mapImport(row: DbImport): ImportJob {
  return {
    id: row.id,
    inputUrl: row.inputUrl,
    targetPlaylistId: row.targetPlaylistId,
    playlistTitle: row.playlistTitle,
    status: row.status as ImportJob["status"],
    phase: (row.phase ?? "queued") as ImportJob["phase"],
    sourceKind: (row.sourceKind as ImportJob["sourceKind"]) ?? null,
    total: row.total,
    completed: row.completed,
    failed: row.failed,
    matched: row.matched,
    skipped: row.skipped,
    truncated: row.truncated === 1,
    sourceTrackCount: row.sourceTrackCount,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    errorMessage: row.errorMessage,
  }
}

export function mapLyricsCache(row: DbLyricsCache): LyricsState | null {
  if (row.status === "synced" && row.syncedLyricsJson) {
    try {
      return {
        status: "synced",
        reason: null,
        lyrics: {
          source: "cache",
          providerTrackId: row.providerTrackId,
          fetchedAt: row.fetchedAt,
          lines: JSON.parse(row.syncedLyricsJson),
        },
      }
    } catch {
      return null
    }
  }

  if (row.status === "static" && row.syncedLyricsJson) {
    try {
      return {
        status: "static",
        reason: null,
        lyrics: {
          source: "cache",
          providerTrackId: row.providerTrackId,
          fetchedAt: row.fetchedAt,
          text: JSON.parse(row.syncedLyricsJson),
        },
      }
    } catch {
      return null
    }
  }

  return {
    status: row.status as Exclude<LyricsState["status"], "synced" | "static">,
    lyrics: null,
    reason: row.errorMessage ?? "No synced lyrics are available for this track.",
  }
}

export function mapTrackCandidateFromJson(json: string): TrackCandidate | null {
  try {
    return JSON.parse(json) as TrackCandidate
  } catch {
    return null
  }
}

function normalizeDownloadStatus(value: string | null | undefined): DownloadStatus {
  const validStatuses = ["not-downloaded", "queued", "downloading", "downloaded", "failed"]
  if (value && validStatuses.includes(value)) {
    return value as DownloadStatus
  }
  return "not-downloaded"
}
