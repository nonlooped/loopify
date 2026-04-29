import { flushSync } from "react-dom"
import type { UpdateStatus } from "src/shared/contracts/ipc"
import {
  isSystemPlaylistId,
  OFFLINE_SONGS_PLAYLIST_ID,
  type PlayerState,
  type Playlist,
  type PlaylistTrackItem,
  type QueueItem,
  type RepeatMode,
  type Track,
  type TrackCandidate,
} from "src/shared/types/music"
import { create } from "zustand"
import type { PlaylistActionState } from "../features/shell/PlaylistActionModal"
import { NEAR_END_OFFSET_SEC } from "../lib/keyboard-shortcuts"

type BootPhase = "loading" | "ready" | "error"

type ViewTransition = {
  finished: Promise<void>
}

type DocumentWithViewTransition = Document & {
  startViewTransition?: (update: () => void) => ViewTransition
}

function formatActionError(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

function sumPlaylistDurationMs(tracks: { durationMs: number | null }[] | undefined): number {
  if (!tracks) return 0
  return tracks.reduce((sum, t) => sum + (t.durationMs ?? 0), 0)
}

function withSystemFlagIfNeeded(playlist: Playlist, patch: Partial<Playlist>): Playlist {
  const next = { ...playlist, ...patch } as Playlist
  return isSystemPlaylistId(next.id) ? { ...next, isSystem: true } : next
}

function patchTrackInPlaylists(playlists: Playlist[], updatedTrack: Track): Playlist[] {
  return playlists.map((playlist) => {
    if (playlist.id === OFFLINE_SONGS_PLAYLIST_ID) {
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
    return withSystemFlagIfNeeded(playlist, {
      tracks: playlist.tracks?.map((track) =>
        track.id === updatedTrack.id ? { ...track, ...updatedTrack } : track
      ),
    })
  })
}

function patchTrackInQueue(queue: QueueItem[], updatedTrack: Track): QueueItem[] {
  return queue.map((item) =>
    item.track?.id === updatedTrack.id
      ? { ...item, track: { ...item.track, ...updatedTrack } }
      : item
  )
}

function patchTrackEverywhere(
  state: { queue: QueueItem[]; playlists: Playlist[] },
  updatedTrack: Track
): { queue: QueueItem[]; playlists: Playlist[] } {
  return {
    queue: patchTrackInQueue(state.queue, updatedTrack),
    playlists: patchTrackInPlaylists(state.playlists, updatedTrack),
  }
}

function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "one"
  if (mode === "one") return "all"
  return "off"
}

export interface AppState {
  bootPhase: BootPhase
  bootError: string | null
  playerState: PlayerState | null
  playlists: Playlist[]
  queue: QueueItem[]
  activePlaylistId: string | null

  isSearchOpen: boolean
  isSettingsOpen: boolean
  isImportOpen: boolean
  isQueueOpen: boolean
  isSidebarExpanded: boolean
  playlistAction: PlaylistActionState | null
  queueClearConfirming: boolean

  updateStatus: UpdateStatus | null
  dismissedUpdatePhase: string | null
  actionError: string | null
  shellReveal: boolean
  isCompactShell: boolean

  lastPlayerState: PlayerState | null

  loadInitialData: () => Promise<void>
  initSubscriptions: () => () => void

  refreshQueue: () => Promise<QueueItem[]>
  refreshPlaylists: () => Promise<Playlist[]>

  setActivePlaylistId: (id: string | null) => void
  selectPlaylistWithTransition: (id: string | null) => void

  handlePlayPause: () => Promise<void>
  handleCycleRepeat: () => Promise<void>
  handleNext: () => Promise<void>
  handlePrevious: () => Promise<void>
  handleStop: () => Promise<void>
  handleSeek: (s: number) => Promise<void>
  handleSeekRelative: (delta: number) => Promise<void>
  handleSeekToStart: () => Promise<void>
  handleSeekNearEnd: () => Promise<void>
  handleVolumeChange: (v: number) => Promise<void>
  handleVolumeDelta: (delta: number) => Promise<void>

  handlePlayTrack: (track: Track | TrackCandidate) => Promise<void>
  handleEnqueueTrack: (track: TrackCandidate) => Promise<void>
  handleEnqueuePlaylistTrack: (track: Track) => Promise<void>
  handlePlayPlaylist: (playlist: Playlist) => Promise<void>
  handleEnqueuePlaylist: (playlist: Playlist) => Promise<void>
  handleShuffleQueue: () => Promise<void>
  queueOnPlay: (item: QueueItem) => Promise<void>
  queueOnRemove: (id: string) => Promise<void>
  queueOnClear: () => Promise<void>
  queueOnReorder: (id: string, newIndex: number) => Promise<void>

  handleCreatePlaylist: () => void
  openRenamePlaylist: (p: Playlist) => void
  openDeletePlaylist: (p: Playlist) => void
  submitPlaylistCreate: (name: string) => Promise<void>
  submitPlaylistRename: (id: string, name: string) => Promise<void>
  submitPlaylistDelete: (id: string) => Promise<void>
  handleRemoveFromPlaylist: (playlistId: string, entryId: string) => Promise<void>
  handleMovePlaylistTrack: (playlistId: string, entryId: string, newIndex: number) => Promise<void>
  handleToggleLikeTrack: (track: Track) => Promise<void>
  handleLikeCandidate: (track: TrackCandidate) => Promise<void>
  handleAddTrackToPlaylist: (playlistId: string, track: Track) => Promise<void>
  handleDownloadTrack: (track: Track) => Promise<void>
  handleDownloadCandidate: (track: TrackCandidate) => Promise<void>
  handleRemoveTrackDownload: (track: Track) => Promise<void>
  handleDownloadPlaylist: (playlist: Playlist) => Promise<void>

  setActionError: (err: string | null) => void
  clearActionError: () => void
  dismissUpdate: () => void
  handleClearQueueShortcut: () => Promise<void>
  setQueueClearConfirming: (v: boolean) => void
  setIsCompactShell: (v: boolean) => void
  toggleSearch: (open?: boolean) => void
  toggleSettings: (open?: boolean) => void
  toggleImport: (open?: boolean) => void
  toggleQueue: (open?: boolean) => void
  toggleSidebar: (open?: boolean) => void
  setShellReveal: (v: boolean) => void
  setPlaylistAction: (s: PlaylistActionState | null) => void
}

export const useAppStore = create<AppState>()((set, get) => ({
  bootPhase: "loading",
  bootError: null,
  playerState: null,
  playlists: [],
  queue: [],
  activePlaylistId: null,

  isSearchOpen: false,
  isSettingsOpen: false,
  isImportOpen: false,
  isQueueOpen: false,
  isSidebarExpanded: false,
  playlistAction: null,
  queueClearConfirming: false,

  updateStatus: null,
  dismissedUpdatePhase: null,
  actionError: null,
  shellReveal: false,
  isCompactShell: false,

  lastPlayerState: null,

  loadInitialData: async () => {
    set({ bootPhase: "loading", bootError: null })
    try {
      const [initialPlayer, initialPlaylists, initialQueue] = await Promise.all([
        window.loopify.player.getState(),
        window.loopify.playlists.list(),
        window.loopify.queue.list(),
      ])
      set({
        playerState: initialPlayer,
        lastPlayerState: initialPlayer,
        playlists: initialPlaylists,
        queue: initialQueue,
        bootPhase: "ready",
      })
    } catch (error) {
      console.error("Failed to load initial data", error)
      set({
        bootPhase: "error",
        bootError:
          error instanceof Error
            ? error.message
            : "Could not connect to the player or library. Retry or restart the app.",
      })
    }
  },

  initSubscriptions: () => {
    const unsubPlayer = window.loopify.player.onStateChange((newState) => {
      const previousState = get().lastPlayerState
      const shouldRefreshCollections =
        !previousState ||
        previousState.queueItemId !== newState.queueItemId ||
        previousState.status !== newState.status ||
        previousState.title !== newState.title
      set({ playerState: newState, lastPlayerState: newState })
      if (shouldRefreshCollections) {
        get().refreshQueue().catch(console.error)
        get().refreshPlaylists().catch(console.error)
      }
    })

    const unsubQueue = window.loopify.queue.onChange((nextQueue) => {
      set({ queue: nextQueue })
    })

    const unsubSettings = window.loopify.settings.onUpdateStatusChange((status) => {
      set({ updateStatus: status })
    })
    window.loopify.settings
      .getUpdateStatus()
      .then((status) => set({ updateStatus: status }))
      .catch(console.error)

    const unsubDownloads = window.loopify.downloads.onChange((track) => {
      set((state) => ({
        queue: patchTrackInQueue(state.queue, track),
        playlists: patchTrackInPlaylists(state.playlists, track),
      }))
    })

    return () => {
      unsubPlayer()
      unsubQueue()
      unsubSettings()
      unsubDownloads()
    }
  },

  refreshQueue: async () => {
    const updated = await window.loopify.queue.list()
    set({ queue: updated })
    return updated
  },

  refreshPlaylists: async () => {
    const updated = await window.loopify.playlists.list()
    set({ playlists: updated })
    return updated
  },

  setActivePlaylistId: (id) => {
    set({ activePlaylistId: id })
  },

  selectPlaylistWithTransition: (id) => {
    const nextId = id || null
    const root = document.documentElement
    const doc = document as DocumentWithViewTransition
    const { activePlaylistId } = get()
    const direction =
      nextId == null
        ? "back"
        : activePlaylistId == null || activePlaylistId !== nextId
          ? "forward"
          : null

    if (!direction || typeof doc.startViewTransition !== "function") {
      set({ activePlaylistId: nextId })
      return
    }

    root.dataset.playlistNav = direction
    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        set({ activePlaylistId: nextId })
      })
    })

    void transition.finished.finally(() => {
      if (root.dataset.playlistNav === direction) {
        delete root.dataset.playlistNav
      }
    })
  },

  handlePlayPause: async () => {
    try {
      const { playerState } = get()
      let nextState: PlayerState | null = null
      if (playerState?.status === "playing") {
        nextState = await window.loopify.player.pause()
      } else if (playerState?.status === "paused") {
        nextState = await window.loopify.player.resume()
      } else if (playerState?.queueItemId) {
        nextState = await window.loopify.player.play(playerState.queueItemId)
      }
      if (nextState) {
        set({ playerState: nextState, lastPlayerState: nextState })
      }
      await get().refreshQueue()
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Playback could not be changed.") })
    }
  },

  handleCycleRepeat: async () => {
    try {
      const { lastPlayerState, playerState } = get()
      const currentMode = lastPlayerState?.repeatMode ?? playerState?.repeatMode ?? "off"
      const nextState = await window.loopify.player.setRepeatMode(nextRepeatMode(currentMode))
      set({ playerState: nextState, lastPlayerState: nextState })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not change repeat mode.") })
    }
  },

  handleNext: async () => {
    const { queue, playerState } = get()
    const currentIndex = queue.findIndex((q) => q.id === playerState?.queueItemId)
    if (currentIndex < 0 || currentIndex >= queue.length - 1) return
    try {
      const nextState = await window.loopify.player.play(queue[currentIndex + 1].id)
      set({ playerState: nextState, lastPlayerState: nextState })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not go to the next track.") })
    }
  },

  handlePrevious: async () => {
    const { queue, playerState } = get()
    const currentIndex = queue.findIndex((q) => q.id === playerState?.queueItemId)
    if (currentIndex <= 0) return
    try {
      const nextState = await window.loopify.player.play(queue[currentIndex - 1].id)
      set({ playerState: nextState, lastPlayerState: nextState })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not go to the previous track.") })
    }
  },

  handleStop: async () => {
    try {
      const st = await window.loopify.player.stop()
      set({ playerState: st, lastPlayerState: st })
      await get().refreshQueue()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not stop playback.") })
    }
  },

  handleSeek: async (s) => {
    try {
      set({ playerState: await window.loopify.player.seek(s) })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleSeekRelative: async (delta) => {
    const s = get().lastPlayerState
    if (!s?.queueItemId) return
    const pos = s.positionSeconds
    const d = s.durationSeconds
    const next = d != null ? Math.max(0, Math.min(d, pos + delta)) : Math.max(0, pos + delta)
    try {
      const st = await window.loopify.player.seek(next)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleSeekToStart: async () => {
    const s = get().lastPlayerState
    if (!s?.queueItemId) return
    try {
      const st = await window.loopify.player.seek(0)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleSeekNearEnd: async () => {
    const s = get().lastPlayerState
    if (!s?.queueItemId) return
    const d = s.durationSeconds
    if (d == null || d <= 0) return
    const target = Math.max(0, d - NEAR_END_OFFSET_SEC)
    try {
      const st = await window.loopify.player.seek(target)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not seek in the current track.") })
    }
  },

  handleVolumeChange: async (v) => {
    try {
      set({ playerState: await window.loopify.player.setVolume(v) })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not change volume.") })
    }
  },

  handleVolumeDelta: async (delta) => {
    const s = get().lastPlayerState
    if (!s) return
    const v = Math.max(0, Math.min(100, (s.volume ?? 75) + delta))
    try {
      const st = await window.loopify.player.setVolume(v)
      set({ playerState: st, lastPlayerState: st })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not change volume.") })
    }
  },

  handlePlayTrack: async (track) => {
    try {
      const sourceUrl = "sourceUrl" in track ? track.sourceUrl : track.canonicalUrl
      const updatedQueue = await window.loopify.queue.add({ sourceUrl, playNow: true })
      set({ queue: updatedQueue })
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start playback for that track.") })
    }
  },

  handleEnqueueTrack: async (track) => {
    try {
      const updatedQueue = await window.loopify.queue.add({
        sourceUrl: track.sourceUrl,
        playNow: false,
      })
      set({ queue: updatedQueue })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that track to the queue.") })
    }
  },

  handleEnqueuePlaylistTrack: async (track) => {
    try {
      const updatedQueue = await window.loopify.queue.add({
        sourceUrl: track.canonicalUrl,
        playNow: false,
      })
      set({ queue: updatedQueue })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that track to the queue.") })
    }
  },

  handlePlayPlaylist: async (playlist) => {
    if (!playlist.tracks || playlist.tracks.length === 0) return
    try {
      const sourceUrls = playlist.tracks.map((t) => t.canonicalUrl)
      const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: true })
      set({ queue: next })
      await get().refreshPlaylists()
    } catch (err) {
      console.error("Failed to play playlist:", err)
      set({ actionError: formatActionError(err, "Could not play that playlist.") })
    }
  },

  handleEnqueuePlaylist: async (playlist) => {
    if (!playlist.tracks || playlist.tracks.length === 0) return
    try {
      const sourceUrls = playlist.tracks.map((t) => t.canonicalUrl)
      const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: false })
      set({ queue: next })
    } catch (err) {
      console.error("Failed to enqueue playlist:", err)
      set({ actionError: formatActionError(err, "Could not add that playlist to the queue.") })
    }
  },

  handleShuffleQueue: async () => {
    const { queue } = get()
    if (queue.length < 2) return
    try {
      const nextQ = await window.loopify.queue.shuffle()
      set({ queue: nextQ })
    } catch (err) {
      console.error("Failed to shuffle queue:", err)
      set({ actionError: formatActionError(err, "Could not shuffle the queue.") })
    }
  },

  queueOnPlay: async (item) => {
    try {
      const nextState = await window.loopify.player.play(item.id)
      set({ playerState: nextState, lastPlayerState: nextState })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not play that queue item.") })
    }
  },

  queueOnRemove: async (id) => {
    try {
      const nextQ = await window.loopify.queue.remove(id)
      set({ queue: nextQ })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not remove that item from the queue.") })
    }
  },

  queueOnClear: async () => {
    try {
      const nextQ = await window.loopify.queue.clear()
      set({ queue: nextQ })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not clear the queue.") })
    }
  },

  queueOnReorder: async (id, newIndex) => {
    try {
      const nextQ = await window.loopify.queue.move(id, newIndex)
      set({ queue: nextQ })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not reorder the queue.") })
    }
  },

  handleCreatePlaylist: () => {
    set({ playlistAction: { kind: "create" } })
  },

  openRenamePlaylist: (p) => {
    set({ playlistAction: { kind: "rename", id: p.id, currentName: p.name } })
  },

  openDeletePlaylist: (p) => {
    set({ playlistAction: { kind: "delete", id: p.id, name: p.name } })
  },

  submitPlaylistCreate: async (name) => {
    const updated = await window.loopify.playlists.create(name)
    set({ playlists: updated, activePlaylistId: updated[updated.length - 1].id })
  },

  submitPlaylistRename: async (id, name) => {
    const updated = await window.loopify.playlists.rename(id, name)
    set({ playlists: updated })
  },

  submitPlaylistDelete: async (id) => {
    const { activePlaylistId } = get()
    const updated = await window.loopify.playlists.delete(id)
    set({
      playlists: updated,
      activePlaylistId: activePlaylistId === id ? (updated[0]?.id ?? null) : activePlaylistId,
    })
  },

  handleRemoveFromPlaylist: async (playlistId, entryId) => {
    try {
      const updated = await window.loopify.playlists.removeTrack(playlistId, entryId)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not remove that track from the playlist.") })
    }
  },

  handleMovePlaylistTrack: async (playlistId, entryId, newIndex) => {
    try {
      const updated = await window.loopify.playlists.moveTrack(playlistId, entryId, newIndex)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not reorder that track.") })
    }
  },

  handleToggleLikeTrack: async (track) => {
    try {
      const updatedTrack = await window.loopify.tracks.setLiked(track.id, !track.likedAt)
      set((state) => ({ queue: patchTrackInQueue(state.queue, updatedTrack) }))
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not update liked songs.") })
    }
  },

  handleLikeCandidate: async (track) => {
    try {
      const updatedTrack = await window.loopify.tracks.setCandidateLiked(track, true)
      set((state) => ({ queue: patchTrackInQueue(state.queue, updatedTrack) }))
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that song to Liked Songs.") })
    }
  },

  handleAddTrackToPlaylist: async (playlistId, track) => {
    try {
      const updated = await window.loopify.playlists.addTrack(playlistId, track.canonicalUrl)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that track to the playlist.") })
    }
  },

  handleDownloadTrack: async (track) => {
    try {
      const updatedTrack = await window.loopify.downloads.downloadTrack(track.id)
      set((state) => patchTrackEverywhere(state, updatedTrack))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start that download.") })
    }
  },

  handleDownloadCandidate: async (track) => {
    try {
      const updatedTrack = await window.loopify.downloads.downloadCandidate(track)
      set((state) => ({ queue: patchTrackInQueue(state.queue, updatedTrack) }))
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start that download.") })
    }
  },

  handleRemoveTrackDownload: async (track) => {
    try {
      const updatedTrack = await window.loopify.downloads.removeTrackDownload(track.id)
      set((state) => patchTrackEverywhere(state, updatedTrack))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not remove that local file.") })
    }
  },

  handleDownloadPlaylist: async (playlist) => {
    try {
      const updated = await window.loopify.downloads.downloadPlaylist(playlist.id)
      set({ playlists: updated })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not start playlist downloads.") })
    }
  },

  setActionError: (err) => {
    set({ actionError: err })
  },

  clearActionError: () => {
    set({ actionError: null })
  },

  dismissUpdate: () => {
    const { updateStatus } = get()
    if (updateStatus) {
      set({ dismissedUpdatePhase: updateStatus.phase })
    }
  },

  handleClearQueueShortcut: async () => {
    const { queue, queueClearConfirming } = get()
    if (queue.length === 0) return
    if (!queueClearConfirming) {
      set({ queueClearConfirming: true })
      return
    }
    set({ queueClearConfirming: false })
    await get().queueOnClear()
  },

  setQueueClearConfirming: (v) => {
    set({ queueClearConfirming: v })
  },

  setIsCompactShell: (v) => {
    set({ isCompactShell: v })
  },

  toggleSearch: (open) => {
    set((state) => ({ isSearchOpen: open ?? !state.isSearchOpen }))
  },

  toggleSettings: (open) => {
    set((state) => ({ isSettingsOpen: open ?? !state.isSettingsOpen }))
  },

  toggleImport: (open) => {
    set((state) => ({ isImportOpen: open ?? !state.isImportOpen }))
  },

  toggleQueue: (open) => {
    set((state) => ({ isQueueOpen: open ?? !state.isQueueOpen }))
  },

  toggleSidebar: (open) => {
    set((state) => ({ isSidebarExpanded: open ?? !state.isSidebarExpanded }))
  },

  setShellReveal: (v) => {
    set({ shellReveal: v })
  },

  setPlaylistAction: (s) => {
    set({ playlistAction: s })
  },
}))
