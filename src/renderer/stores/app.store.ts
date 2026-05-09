import { flushSync } from "react-dom"
import type {
  HomeRecommendations,
  RecommendationMetrics,
  UpdateStatus,
} from "src/shared/contracts/ipc"
import {
  isSystemPlaylistId,
  LIKED_SONGS_PLAYLIST_ID,
  OFFLINE_SONGS_PLAYLIST_ID,
  type PlayerPosition,
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

export type LibraryView =
  | { kind: "collection" }
  | { kind: "discover" }
  | { kind: "playlist"; id: string }
  | { kind: "artist"; deezerId: number }
  | { kind: "album"; deezerId: number }

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

function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
}

function withSystemFlagIfNeeded(playlist: Playlist, patch: Partial<Playlist>): Playlist {
  const next = { ...playlist, ...patch } as Playlist
  return isSystemPlaylistId(next.id) ? { ...next, isSystem: true } : next
}

function patchTrackInPlaylists(playlists: Playlist[], updatedTrack: Track): Playlist[] {
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

function mergeFreshPlaylists(prevList: Playlist[], freshList: Playlist[]): Playlist[] {
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

function patchTrackInQueue(queue: QueueItem[], updatedTrack: Track): QueueItem[] {
  return queue.map((item) =>
    item.track?.id === updatedTrack.id
      ? { ...item, track: { ...item.track, ...updatedTrack } }
      : item
  )
}

function patchTrackEverywhere(
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

function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "one"
  if (mode === "one") return "all"
  return "off"
}

function deriveQueueNavigation(queue: QueueItem[], queueItemId: string | null | undefined) {
  const currentTrackIndex = queue.findIndex((item) => item.id === queueItemId)
  const currentQueueItem = currentTrackIndex >= 0 ? queue[currentTrackIndex] : null
  return {
    currentQueueItem: currentQueueItem as QueueItem | null,
    currentTrackIndex,
    hasNext: currentTrackIndex >= 0 && currentTrackIndex < queue.length - 1,
    hasPrevious: currentTrackIndex > 0,
  }
}

interface AppState {
  bootPhase: BootPhase
  bootError: string | null
  playerState: PlayerState | null
  playerPosition: PlayerPosition | null
  playlists: Playlist[]
  queue: QueueItem[]
  queueMap: Map<string, QueueItem>
  currentQueueItem: QueueItem | null
  currentTrackIndex: number
  hasNext: boolean
  hasPrevious: boolean
  libraryView: LibraryView
  previousLibraryView: LibraryView | null

  isSearchOpen: boolean

  isSettingsOpen: boolean
  isImportOpen: boolean
  isShortcutsOpen: boolean
  isQueueOpen: boolean
  isSidebarExpanded: boolean
  playlistAction: PlaylistActionState | null
  queueClearConfirming: boolean

  updateStatus: UpdateStatus | null
  recommendationsEnabled: boolean
  homeRecommendations: HomeRecommendations | null
  recommendationMetrics: RecommendationMetrics | null
  dismissedUpdatePhase: string | null
  actionError: string | null
  shellReveal: boolean
  isCompactShell: boolean

  lastPlayerState: PlayerState | null

  loadInitialData: () => Promise<void>
  initSubscriptions: () => () => void

  refreshQueue: () => Promise<QueueItem[]>
  refreshPlaylists: () => Promise<Playlist[]>
  refreshPlaylistsMetadata: () => Promise<Playlist[]>
  refreshRecommendations: () => Promise<void>

  trackRecommendationInteraction: (
    trackId: string,
    type: "play" | "skip" | "like" | "save" | "dismiss",
    metadata?: string
  ) => Promise<void>

  setLibraryView: (view: LibraryView) => void
  selectPlaylistWithTransition: (id: string | null) => void
  goBack: () => void

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
  playlistShuffleIds: Set<string>
  togglePlaylistShuffle: (id: string) => void
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
  toggleShortcuts: (open?: boolean) => void
  toggleQueue: (open?: boolean) => void
  toggleSidebar: (open?: boolean) => void
  setShellReveal: (v: boolean) => void
  setPlaylistAction: (s: PlaylistActionState | null) => void
}

function setQueue(nextQueue: QueueItem[], queueItemId: string | null | undefined) {
  return {
    queue: nextQueue,
    ...deriveQueueNavigation(nextQueue, queueItemId),
    queueMap: new Map(nextQueue.map((item) => [item.id, item])),
  }
}

export const useAppStore = create<AppState>()((set, get) => ({
  bootPhase: "loading",
  bootError: null,
  playerState: null,
  playerPosition: null,
  playlists: [],
  queue: [],
  queueMap: new Map(),
  currentQueueItem: null,
  currentTrackIndex: -1,
  hasNext: false,
  hasPrevious: false,
  libraryView: { kind: "collection" },
  previousLibraryView: null,

  isSearchOpen: false,

  isSettingsOpen: false,
  isImportOpen: false,
  isShortcutsOpen: false,
  isQueueOpen: false,
  isSidebarExpanded: false,
  playlistAction: null,
  queueClearConfirming: false,

  updateStatus: null,
  recommendationsEnabled: false,
  homeRecommendations: null,
  recommendationMetrics: null,
  dismissedUpdatePhase: null,
  actionError: null,
  shellReveal: false,
  isCompactShell: false,
  playlistShuffleIds: new Set(),

  lastPlayerState: null,

  loadInitialData: async () => {
    set({ bootPhase: "loading", bootError: null })
    try {
      const [initialPlayer, initialPlaylists, initialQueue] = await Promise.all([
        window.loopify.player.getState(),
        window.loopify.playlists.list(),
        window.loopify.queue.list(),
      ])
      const recommendationsEnabled = await window.loopify.recommendations.isEnabled()
      const [homeRecommendations, recommendationMetrics] = recommendationsEnabled
        ? await Promise.all([
            window.loopify.recommendations.getHome(12),
            window.loopify.recommendations.getMetrics(),
          ])
        : [null, null]
      set({
        playerState: initialPlayer,
        playerPosition: {
          positionSeconds: initialPlayer.positionSeconds,
          durationSeconds: initialPlayer.durationSeconds,
          bufferedDuration: 0,
        },
        lastPlayerState: initialPlayer,
        playlists: initialPlaylists,
        queue: initialQueue,
        ...deriveQueueNavigation(initialQueue, initialPlayer?.queueItemId),
        queueMap: new Map(initialQueue.map((item) => [item.id, item])),
        recommendationsEnabled,
        homeRecommendations,
        recommendationMetrics,
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
    let lastPlayerMetadataJson = ""
    const unsubPlayer = window.loopify.player.onStateChange((newState) => {
      const { positionSeconds: _pos, durationSeconds: _dur, ...metaOnly } = newState
      const metaJson = JSON.stringify(metaOnly)
      if (metaJson === lastPlayerMetadataJson) {
        return
      }
      lastPlayerMetadataJson = metaJson

      const previousState = get().lastPlayerState
      const shouldRefreshCollections =
        !previousState ||
        previousState.queueItemId !== newState.queueItemId ||
        previousState.status !== newState.status ||
        previousState.title !== newState.title
      set({
        playerState: newState,
        lastPlayerState: newState,
        playerPosition: {
          positionSeconds: newState.positionSeconds,
          durationSeconds: newState.durationSeconds,
          bufferedDuration: 0,
        },
        ...deriveQueueNavigation(get().queue, newState.queueItemId),
      })
      if (shouldRefreshCollections) {
        get().refreshQueue().catch(console.error)
      }
    })

    const unsubPosition = window.loopify.player.onPositionChange((position) => {
      set({ playerPosition: position })
    })

    const unsubQueue = window.loopify.queue.onChange((nextQueue) => {
      const { playerState } = get()
      set({
        ...setQueue(nextQueue, playerState?.queueItemId),
      })
    })

    const unsubSettings = window.loopify.settings.onUpdateStatusChange((status) => {
      set({ updateStatus: status })
    })
    window.loopify.settings
      .getUpdateStatus()
      .then((status) => set({ updateStatus: status }))
      .catch(console.error)

    const unsubDownloads = window.loopify.downloads.onChange((track) => {
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, track)
        return {
          ...setQueue(nextQueue, state.playerState?.queueItemId),
          playlists: patchTrackInPlaylists(state.playlists, track),
        }
      })
    })

    return () => {
      unsubPlayer()
      unsubPosition()
      unsubQueue()
      unsubSettings()
      unsubDownloads()
    }
  },

  refreshQueue: async () => {
    const updated = await window.loopify.queue.list()
    const { playerState } = get()
    set({
      queue: updated,
      ...deriveQueueNavigation(updated, playerState?.queueItemId),
      queueMap: new Map(updated.map((item) => [item.id, item])),
    })
    return updated
  },

  refreshPlaylists: async () => {
    const updated = await window.loopify.playlists.list()
    set((state) => ({
      playlists: mergeFreshPlaylists(state.playlists, updated),
    }))
    return updated
  },

  refreshPlaylistsMetadata: async () => {
    const metadata = await window.loopify.playlists.listMetadata()
    set((state) => ({
      playlists: metadata.map((meta) => {
        const existing = state.playlists.find((p) => p.id === meta.id)
        if (existing) {
          return {
            ...meta,
            tracks: existing.tracks,
            totalDurationMs: meta.totalDurationMs,
            trackCount: meta.trackCount ?? existing.trackCount,
          }
        }
        return meta
      }),
    }))
    return metadata
  },

  refreshRecommendations: async () => {
    const { recommendationsEnabled } = get()
    if (!recommendationsEnabled) return
    const [homeRecommendations, recommendationMetrics] = await Promise.all([
      window.loopify.recommendations.getHome(12),
      window.loopify.recommendations.getMetrics(),
    ])
    set({ homeRecommendations, recommendationMetrics })
  },

  trackRecommendationInteraction: async (trackId, type, metadata) => {
    const sessionId = get().homeRecommendations?.sessionId
    if (!sessionId) return
    await window.loopify.recommendations.trackInteraction({ sessionId, trackId, type, metadata })
    await get().refreshRecommendations()
  },

  setLibraryView: (view: LibraryView) => {
    set((state) => ({ previousLibraryView: state.libraryView, libraryView: view }))
  },

  goBack: () => {
    set((state) => {
      if (!state.previousLibraryView) {
        return { libraryView: { kind: "collection" }, previousLibraryView: null }
      }
      return { libraryView: state.previousLibraryView, previousLibraryView: null }
    })
  },

  selectPlaylistWithTransition: (id) => {
    const nextView: LibraryView = id ? { kind: "playlist", id } : { kind: "collection" }
    const root = document.documentElement
    const doc = document as DocumentWithViewTransition
    const { libraryView } = get()
    const currentKind = libraryView.kind
    const direction =
      nextView.kind === "collection"
        ? "back"
        : currentKind === "collection" || (libraryView.kind === "playlist" && libraryView.id !== id)
          ? "forward"
          : null

    if (!direction || typeof doc.startViewTransition !== "function") {
      set((state) => ({ previousLibraryView: state.libraryView, libraryView: nextView }))
      return
    }

    root.dataset.playlistNav = direction
    const transition = doc.startViewTransition(() => {
      flushSync(() => {
        set((state) => ({ previousLibraryView: state.libraryView, libraryView: nextView }))
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
        const queue = get().queue
        set({
          playerState: nextState,
          lastPlayerState: nextState,
          ...deriveQueueNavigation(queue, nextState.queueItemId),
        })
      }
      await Promise.all([get().refreshQueue(), get().refreshPlaylists()])
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
      const queue = get().queue
      set({
        playerState: nextState,
        lastPlayerState: nextState,
        ...deriveQueueNavigation(queue, nextState.queueItemId),
      })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not change repeat mode.") })
    }
  },

  handleNext: async () => {
    const { queue, currentTrackIndex } = get()
    if (currentTrackIndex < 0 || currentTrackIndex >= queue.length - 1) return
    try {
      const nextState = await window.loopify.player.play(queue[currentTrackIndex + 1].id)
      set({ playerState: nextState, lastPlayerState: nextState })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not go to the next track.") })
    }
  },

  handlePrevious: async () => {
    const { queue, currentTrackIndex } = get()
    if (currentTrackIndex <= 0) return
    try {
      const nextState = await window.loopify.player.play(queue[currentTrackIndex - 1].id)
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
      if ("id" in track) {
        await get().trackRecommendationInteraction(track.id, "play")
      }
      const sourceUrl = "sourceUrl" in track ? track.sourceUrl : track.canonicalUrl
      const updatedQueue = await window.loopify.queue.add({ sourceUrl, playNow: true })
      set(setQueue(updatedQueue, get().playerState?.queueItemId))
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
      set(setQueue(updatedQueue, get().playerState?.queueItemId))
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
      set(setQueue(updatedQueue, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not add that track to the queue.") })
    }
  },

  handlePlayPlaylist: async (playlist) => {
    try {
      const tracks =
        playlist.tracks && playlist.tracks.length > 0
          ? playlist.tracks
          : await window.loopify.playlists.getTracks(playlist.id)
      if (tracks.length === 0) return
      let sourceUrls = tracks.map((t) => t.canonicalUrl)
      const { playlistShuffleIds } = get()
      if (playlistShuffleIds.has(playlist.id)) {
        sourceUrls = shuffleArray(sourceUrls)
      }
      const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: true })
      set(setQueue(next, get().playerState?.queueItemId))
      await get().refreshPlaylists()
    } catch (err) {
      console.error("Failed to play playlist:", err)
      set({ actionError: formatActionError(err, "Could not play that playlist.") })
    }
  },

  handleEnqueuePlaylist: async (playlist) => {
    try {
      const tracks =
        playlist.tracks && playlist.tracks.length > 0
          ? playlist.tracks
          : await window.loopify.playlists.getTracks(playlist.id)
      if (tracks.length === 0) return
      const sourceUrls = tracks.map((t) => t.canonicalUrl)
      const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: false })
      set(setQueue(next, get().playerState?.queueItemId))
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
      set(setQueue(nextQ, get().playerState?.queueItemId))
    } catch (err) {
      console.error("Failed to shuffle queue:", err)
      set({ actionError: formatActionError(err, "Could not shuffle the queue.") })
    }
  },

  togglePlaylistShuffle: (id) => {
    const { playlistShuffleIds } = get()
    const next = new Set(playlistShuffleIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    set({ playlistShuffleIds: next })
  },

  queueOnPlay: async (item) => {
    try {
      const nextState = await window.loopify.player.play(item.id)
      const queue = get().queue
      set({
        playerState: nextState,
        lastPlayerState: nextState,
        ...setQueue(queue, nextState.queueItemId),
      })
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not play that queue item.") })
    }
  },

  queueOnRemove: async (id) => {
    try {
      const nextQ = await window.loopify.queue.remove(id)
      set(setQueue(nextQ, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not remove that item from the queue.") })
    }
  },

  queueOnClear: async () => {
    try {
      const nextQ = await window.loopify.queue.clear()
      set(setQueue(nextQ, get().playerState?.queueItemId))
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not clear the queue.") })
    }
  },

  queueOnReorder: async (id, newIndex) => {
    try {
      const nextQ = await window.loopify.queue.move(id, newIndex)
      set(setQueue(nextQ, get().playerState?.queueItemId))
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
    await window.loopify.playlists.create(name)
    const metadata = await get().refreshPlaylistsMetadata()
    const lastPlaylist = metadata[metadata.length - 1]
    if (lastPlaylist) {
      set({ libraryView: { kind: "playlist", id: lastPlaylist.id } })
    }
  },

  submitPlaylistRename: async (id, name) => {
    await window.loopify.playlists.rename(id, name)
    await get().refreshPlaylistsMetadata()
  },

  submitPlaylistDelete: async (id) => {
    const { libraryView } = get()
    const isViewingDeletedPlaylist = libraryView.kind === "playlist" && libraryView.id === id
    await window.loopify.playlists.delete(id)
    await get().refreshPlaylistsMetadata()
    if (isViewingDeletedPlaylist) {
      set({ libraryView: { kind: "collection" } })
    }
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
      if (!track.likedAt) {
        await get().trackRecommendationInteraction(track.id, "like")
        await get().trackRecommendationInteraction(track.id, "save")
      }
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, updatedTrack)
        return setQueue(nextQueue, state.playerState?.queueItemId)
      })
      await get().refreshPlaylists()
    } catch (err) {
      console.error(err)
      set({ actionError: formatActionError(err, "Could not update liked songs.") })
    }
  },

  handleLikeCandidate: async (track) => {
    try {
      const updatedTrack = await window.loopify.tracks.setCandidateLiked(track, true)
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, updatedTrack)
        return setQueue(nextQueue, state.playerState?.queueItemId)
      })
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
      set((state) => {
        const nextQueue = patchTrackInQueue(state.queue, updatedTrack)
        return setQueue(nextQueue, state.playerState?.queueItemId)
      })
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

  toggleShortcuts: (open) => {
    set((state) => ({ isShortcutsOpen: open ?? !state.isShortcutsOpen }))
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
