import {
  isSystemPlaylistId,
  LIKED_SONGS_PLAYLIST_ID,
  OFFLINE_SONGS_PLAYLIST_ID,
  type PlayerState,
  type Playlist,
  type PlaylistTrackItem,
  type QueueItem,
  type RepeatMode,
  type Track,
} from "src/shared/types/music"

export function formatActionError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export function sumPlaylistDurationMs(tracks: { durationMs: number | null }[] | undefined): number {
  if (!tracks) return 0
  return tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0)
}

export function withSystemFlagIfNeeded(playlist: Playlist, patch: Partial<Playlist>): Playlist {
  const next = { ...playlist, ...patch } as Playlist
  return isSystemPlaylistId(next.id) ? { ...next, isSystem: true } : next
}

export function patchTrackInPlaylists(playlists: Playlist[], updatedTrack: Track): Playlist[] {
  return playlists.map((playlist) => {
    if (playlist.id === OFFLINE_SONGS_PLAYLIST_ID) {
      if (playlist.tracks === undefined) {
        return playlist
      }
      const existing = playlist.tracks ?? []
      const without = existing.filter((t) => t.id !== updatedTrack.id)
      if (
        updatedTrack.downloadStatus === "downloaded" &&
        (updatedTrack.downloadedFilePath?.length ?? 0) > 0
      ) {
        const item: PlaylistTrackItem = {
          ...updatedTrack,
          playlistEntryId: `offline_${updatedTrack.id}`,
          addedAt: updatedTrack.downloadedAt ?? updatedTrack.updatedAt,
        }
        const tracks = [item, ...without]
        return withSystemFlagIfNeeded(playlist, {
          tracks,
          totalDurationMs: sumPlaylistDurationMs(tracks),
        })
      }
      const tracks = without
      return withSystemFlagIfNeeded(playlist, {
        tracks,
        totalDurationMs: sumPlaylistDurationMs(tracks),
      })
    }
    if (playlist.id === LIKED_SONGS_PLAYLIST_ID && playlist.tracks === undefined) {
      return playlist
    }
    return withSystemFlagIfNeeded(playlist, {
      tracks: playlist.tracks?.map((track) =>
        track.id === updatedTrack.id ? { ...track, ...updatedTrack } : track
      ),
    })
  })
}

export function mergeFreshPlaylists(prevList: Playlist[], freshList: Playlist[]): Playlist[] {
  return freshList.map((fresh) => {
    const prev = prevList.find((p) => p.id === fresh.id)
    if (!prev) return fresh
    if (prev.tracks !== undefined && fresh.tracks === undefined) {
      return {
        ...fresh,
        tracks: prev.tracks,
        trackCount: prev.trackCount ?? prev.tracks.length,
      }
    }
    return fresh
  })
}

export function patchTrackInQueue(queue: QueueItem[], updatedTrack: Track): QueueItem[] {
  return queue.map((item) =>
    item.track?.id === updatedTrack.id
      ? { ...item, track: { ...item.track, ...updatedTrack } }
      : item
  )
}

export function patchTrackEverywhere(
  state: { queue: QueueItem[]; playlists: Playlist[]; playerState: PlayerState | null },
  updatedTrack: Track
): {
  queue: QueueItem[]
  playlists: Playlist[]
  currentQueueItem: QueueItem | null
  currentTrackIndex: number
  hasNext: boolean
  hasPrevious: boolean
  queueMap: Map<string, QueueItem>
} {
  const nextQueue = patchTrackInQueue(state.queue, updatedTrack)
  return {
    ...setQueue(nextQueue, state.playerState?.queueItemId),
    playlists: patchTrackInPlaylists(state.playlists, updatedTrack),
  }
}

export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "one"
  if (mode === "one") return "all"
  return "off"
}

export function deriveQueueNavigation(queue: QueueItem[], queueItemId: string | null | undefined) {
  const currentTrackIndex = queue.findIndex((item) => item.id === queueItemId)
  const currentQueueItem = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null
  return {
    currentQueueItem: currentQueueItem as QueueItem | null,
    currentTrackIndex,
    hasNext: currentTrackIndex >= 0 && currentTrackIndex < queue.length - 1,
    hasPrevious: currentTrackIndex > 0,
  }
}

export function setQueue(nextQueue: QueueItem[], queueItemId: string | null | undefined) {
  return {
    queue: nextQueue,
    ...deriveQueueNavigation(nextQueue, queueItemId),
    queueMap: new Map(nextQueue.map((item) => [item.id, item])),
  }
}
