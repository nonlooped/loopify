import { Loader2 } from "lucide-react"
import type { Dispatch, SetStateAction } from "react"
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"
import { AppErrorBanner } from "@/components/AppErrorBanner"
import { Button } from "@/components/Button"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { cn } from "@/lib/cn"
import { NEAR_END_OFFSET_SEC, useAppKeyboardShortcuts } from "@/lib/keyboard-shortcuts"
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
} from "../../../shared/types/music"
import { Workspace } from "../../features/library/Workspace"
import { FloatingIsland } from "../../features/player/FloatingIsland"
import { NavRail } from "../../features/shell/NavRail"
import type { PlaylistActionState } from "../../features/shell/PlaylistActionModal"

const CommandPalette = lazy(() =>
  import("../../features/shell/CommandPalette").then((m) => ({ default: m.CommandPalette }))
)
const ImportModal = lazy(() =>
  import("../../features/shell/ImportModal").then((m) => ({ default: m.ImportModal }))
)
const SettingsModal = lazy(() =>
  import("../../features/shell/SettingsModal").then((m) => ({ default: m.SettingsModal }))
)
const QueueOverlay = lazy(() =>
  import("../../features/player/QueueOverlay").then((m) => ({ default: m.QueueOverlay }))
)
const PlaylistActionModal = lazy(() =>
  import("../../features/shell/PlaylistActionModal").then((m) => ({
    default: m.PlaylistActionModal,
  }))
)

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

function nextRepeatMode(mode: RepeatMode): RepeatMode {
  if (mode === "off") return "one"
  if (mode === "one") return "all"
  return "off"
}

export function App() {
  const [bootPhase, setBootPhase] = useState<BootPhase>("loading")
  const [bootError, setBootError] = useState<string | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState | null>(null)
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [activePlaylistId, setActivePlaylistId] = useState<string | null>(null)

  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [isQueueOpen, setIsQueueOpen] = useState(false)
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(false)
  const [playlistAction, setPlaylistAction] = useState<PlaylistActionState | null>(null)
  const [shellReveal, setShellReveal] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const lastPlayerState = useRef<PlayerState | null>(null)

  const refreshQueue = useCallback(async () => {
    const updatedQueue = await window.loopify.queue.list()
    setQueue(updatedQueue)
    return updatedQueue
  }, [])

  const refreshPlaylists = useCallback(async () => {
    const updatedPlaylists = await window.loopify.playlists.list()
    setPlaylists(updatedPlaylists)
    return updatedPlaylists
  }, [])

  const loadInitialData = useCallback(async () => {
    setBootPhase("loading")
    setBootError(null)
    try {
      const [initialPlayer, initialPlaylists, initialQueue] = await Promise.all([
        window.loopify.player.getState(),
        window.loopify.playlists.list(),
        window.loopify.queue.list(),
      ])

      lastPlayerState.current = initialPlayer
      setPlayerState(initialPlayer)
      setPlaylists(initialPlaylists)
      setQueue(initialQueue)

      setBootPhase("ready")
    } catch (error) {
      console.error("Failed to load initial data", error)
      setBootPhase("error")
      setBootError(
        error instanceof Error
          ? error.message
          : "Could not connect to the player or library. Retry or restart the app."
      )
    }
  }, [])

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    if (bootPhase !== "ready") return
    if (reducedMotion) {
      setShellReveal(true)
      return
    }
    const r = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setShellReveal(true)
      })
    })
    return () => cancelAnimationFrame(r)
  }, [bootPhase, reducedMotion])

  useEffect(() => {
    const unsubscribe = window.loopify.player.onStateChange((newState) => {
      const previousState = lastPlayerState.current
      const shouldRefreshCollections =
        !previousState ||
        previousState.queueItemId !== newState.queueItemId ||
        previousState.status !== newState.status ||
        previousState.title !== newState.title
      lastPlayerState.current = newState
      setPlayerState(newState)
      if (shouldRefreshCollections) {
        refreshQueue().catch(console.error)
        refreshPlaylists().catch(console.error)
      }
    })

    const unsubscribeQueue = window.loopify.queue.onChange((nextQueue) => {
      setQueue(nextQueue)
    })

    return () => {
      unsubscribe()
      unsubscribeQueue()
    }
  }, [refreshPlaylists, refreshQueue])

  if (bootPhase === "loading") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-canvas px-6 text-foreground">
        <div className="flex max-w-sm flex-col items-center gap-6 text-center">
          <Loader2 className="h-10 w-10 text-accent animate-spin-slow" aria-hidden />
          <p className="text-sm font-medium text-muted">Starting audio…</p>
        </div>
      </div>
    )
  }

  if (bootPhase === "error") {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-canvas px-6 text-foreground">
        <div className="flex w-full max-w-md flex-col items-stretch gap-6 text-center">
          <h1 className="type-heading m-0">Could not start</h1>
          <p
            className="rounded-xl bg-surface p-6 text-left text-sm font-semibold leading-relaxed text-muted"
            role="alert"
          >
            {bootError}
          </p>
          <Button type="button" size="lg" onClick={() => void loadInitialData()}>
            Retry Initialization
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn("ol-app-fade h-full min-h-0 w-full", shellReveal ? "is-visible" : "is-hidden")}
    >
      <AppTree
        playerState={playerState}
        setPlayerState={setPlayerState}
        queue={queue}
        setQueue={setQueue}
        playlists={playlists}
        setPlaylists={setPlaylists}
        activePlaylistId={activePlaylistId}
        setActivePlaylistId={setActivePlaylistId}
        isSearchOpen={isSearchOpen}
        setIsSearchOpen={setIsSearchOpen}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        isImportOpen={isImportOpen}
        setIsImportOpen={setIsImportOpen}
        isQueueOpen={isQueueOpen}
        setIsQueueOpen={setIsQueueOpen}
        isSidebarExpanded={isSidebarExpanded}
        setIsSidebarExpanded={setIsSidebarExpanded}
        playlistAction={playlistAction}
        setPlaylistAction={setPlaylistAction}
        lastPlayerState={lastPlayerState}
        refreshQueue={refreshQueue}
        refreshPlaylists={refreshPlaylists}
      />
    </div>
  )
}

type AppTreeProps = {
  playerState: PlayerState | null
  setPlayerState: Dispatch<SetStateAction<PlayerState | null>>
  queue: QueueItem[]
  setQueue: Dispatch<SetStateAction<QueueItem[]>>
  playlists: Playlist[]
  setPlaylists: Dispatch<SetStateAction<Playlist[]>>
  activePlaylistId: string | null
  setActivePlaylistId: (id: string | null) => void
  isSearchOpen: boolean
  setIsSearchOpen: (o: boolean) => void
  isSettingsOpen: boolean
  setIsSettingsOpen: (o: boolean) => void
  isImportOpen: boolean
  setIsImportOpen: (o: boolean) => void
  isQueueOpen: boolean
  setIsQueueOpen: Dispatch<SetStateAction<boolean>>
  isSidebarExpanded: boolean
  setIsSidebarExpanded: Dispatch<SetStateAction<boolean>>
  playlistAction: PlaylistActionState | null
  setPlaylistAction: (s: PlaylistActionState | null) => void
  lastPlayerState: React.MutableRefObject<PlayerState | null>
  refreshQueue: () => Promise<QueueItem[]>
  refreshPlaylists: () => Promise<Playlist[]>
}

function AppTree({
  playerState,
  setPlayerState,
  queue,
  setQueue,
  playlists,
  setPlaylists,
  activePlaylistId,
  setActivePlaylistId,
  isSearchOpen,
  setIsSearchOpen,
  isSettingsOpen,
  setIsSettingsOpen,
  isImportOpen,
  setIsImportOpen,
  isQueueOpen,
  setIsQueueOpen,
  isSidebarExpanded,
  setIsSidebarExpanded,
  playlistAction,
  setPlaylistAction,
  lastPlayerState,
  refreshQueue,
  refreshPlaylists,
}: AppTreeProps) {
  const [actionError, setActionError] = useState<string | null>(null)
  const [isCompactShell, setIsCompactShell] = useState(false)
  const clearActionError = useCallback(() => setActionError(null), [])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1600px), (max-height: 940px)")
    const applyViewportMode = () => setIsCompactShell(mediaQuery.matches)

    applyViewportMode()
    mediaQuery.addEventListener("change", applyViewportMode)

    return () => mediaQuery.removeEventListener("change", applyViewportMode)
  }, [])

  const selectPlaylistWithTransition = useCallback(
    (id: string | null) => {
      const nextId = id || null
      const root = document.documentElement
      const doc = document as DocumentWithViewTransition
      const direction =
        nextId == null
          ? "back"
          : activePlaylistId == null || activePlaylistId !== nextId
            ? "forward"
            : null

      if (!direction || typeof doc.startViewTransition !== "function") {
        setActivePlaylistId(nextId)
        return
      }

      root.dataset.playlistNav = direction
      const transition = doc.startViewTransition(() => {
        flushSync(() => {
          setActivePlaylistId(nextId)
        })
      })

      void transition.finished.finally(() => {
        if (root.dataset.playlistNav === direction) {
          delete root.dataset.playlistNav
        }
      })
    },
    [activePlaylistId, setActivePlaylistId]
  )

  useEffect(() => {
    if (!actionError) return
    const t = window.setTimeout(() => setActionError(null), 8000)
    return () => window.clearTimeout(t)
  }, [actionError])

  useEffect(() => {
    const unsubscribe = window.loopify.downloads.onChange((track) => {
      setQueue((current) => patchTrackInQueue(current, track))
      setPlaylists((current) => patchTrackInPlaylists(current, track))
    })
    return unsubscribe
  }, [setPlaylists, setQueue])

  const currentQueueItem = queue.find((q) => q.id === playerState?.queueItemId)
  const currentTrack = currentQueueItem?.track ?? null
  const currentArtist = currentQueueItem?.track?.artist || "..."
  const currentArtwork = currentQueueItem?.track?.thumbnailUrl
  const currentQueueIndex = queue.findIndex((q) => q.id === playerState?.queueItemId)
  const hasNext = currentQueueIndex >= 0 && currentQueueIndex < queue.length - 1
  const hasPrevious = currentQueueIndex > 0
  const hasFloatingPlayer =
    Boolean(playerState?.queueItemId) &&
    (playerState?.status === "playing" || playerState?.status === "paused")
  const {
    shouldRender: shouldRenderFloatingPlayer,
    showOverlay: showFloatingPlayer,
    onBackdropTransitionEnd: onFloatingPlayerTransitionEnd,
  } = useOverlayPresence(hasFloatingPlayer)

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) || null

  const handleCreatePlaylist = useCallback(
    () => setPlaylistAction({ kind: "create" }),
    [setPlaylistAction]
  )
  const openRenamePlaylist = useCallback(
    (p: Playlist) => setPlaylistAction({ kind: "rename", id: p.id, currentName: p.name }),
    [setPlaylistAction]
  )
  const openDeletePlaylist = useCallback(
    (p: Playlist) => setPlaylistAction({ kind: "delete", id: p.id, name: p.name }),
    [setPlaylistAction]
  )

  const submitPlaylistCreate = useCallback(
    async (name: string) => {
      const updated = await window.loopify.playlists.create(name)
      setPlaylists(updated)
      setActivePlaylistId(updated[updated.length - 1].id)
    },
    [setActivePlaylistId, setPlaylists]
  )
  const submitPlaylistRename = useCallback(
    async (id: string, name: string) => {
      const updated = await window.loopify.playlists.rename(id, name)
      setPlaylists(updated)
    },
    [setPlaylists]
  )
  const submitPlaylistDelete = useCallback(
    async (id: string) => {
      const updated = await window.loopify.playlists.delete(id)
      setPlaylists(updated)
      if (activePlaylistId === id) setActivePlaylistId(updated[0]?.id ?? null)
    },
    [activePlaylistId, setActivePlaylistId, setPlaylists]
  )

  const handleRemoveFromPlaylist = useCallback(
    async (playlistId: string, entryId: string) => {
      try {
        const updated = await window.loopify.playlists.removeTrack(playlistId, entryId)
        setPlaylists(updated)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not remove that track from the playlist."))
      }
    },
    [setPlaylists]
  )

  const handleMovePlaylistTrack = useCallback(
    async (playlistId: string, entryId: string, newIndex: number) => {
      try {
        const updated = await window.loopify.playlists.moveTrack(playlistId, entryId, newIndex)
        setPlaylists(updated)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not reorder that track."))
      }
    },
    [setPlaylists]
  )

  const handlePlayTrack = useCallback(
    async (track: Track | TrackCandidate) => {
      try {
        const sourceUrl = "sourceUrl" in track ? track.sourceUrl : track.canonicalUrl
        const updatedQueue = await window.loopify.queue.add({ sourceUrl, playNow: true })
        setQueue(updatedQueue)
        await refreshPlaylists()
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not start playback for that track."))
      }
    },
    [refreshPlaylists, setQueue]
  )

  const handleEnqueueTrack = useCallback(
    async (track: TrackCandidate) => {
      try {
        const updatedQueue = await window.loopify.queue.add({
          sourceUrl: track.sourceUrl,
          playNow: false,
        })
        setQueue(updatedQueue)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not add that track to the queue."))
      }
    },
    [setQueue]
  )

  const handleEnqueuePlaylistTrack = useCallback(
    async (track: Track) => {
      try {
        const updatedQueue = await window.loopify.queue.add({
          sourceUrl: track.canonicalUrl,
          playNow: false,
        })
        setQueue(updatedQueue)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not add that track to the queue."))
      }
    },
    [setQueue]
  )

  const handleToggleLikeTrack = useCallback(
    async (track: Track) => {
      try {
        const updatedTrack = await window.loopify.tracks.setLiked(track.id, !track.likedAt)
        setQueue((current) => patchTrackInQueue(current, updatedTrack))
        await refreshPlaylists()
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not update liked songs."))
      }
    },
    [refreshPlaylists, setQueue]
  )

  const handleLikeCandidate = useCallback(
    async (track: TrackCandidate) => {
      try {
        const updatedTrack = await window.loopify.tracks.setCandidateLiked(track, true)
        setQueue((current) => patchTrackInQueue(current, updatedTrack))
        await refreshPlaylists()
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not add that song to Liked Songs."))
      }
    },
    [refreshPlaylists, setQueue]
  )

  const handleDownloadTrack = useCallback(
    async (track: Track) => {
      try {
        const updatedTrack = await window.loopify.downloads.downloadTrack(track.id)
        setQueue((current) => patchTrackInQueue(current, updatedTrack))
        setPlaylists((current) => patchTrackInPlaylists(current, updatedTrack))
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not start that download."))
      }
    },
    [setPlaylists, setQueue]
  )

  const handleDownloadCandidate = useCallback(
    async (track: TrackCandidate) => {
      try {
        const updatedTrack = await window.loopify.downloads.downloadCandidate(track)
        setQueue((current) => patchTrackInQueue(current, updatedTrack))
        await refreshPlaylists()
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not start that download."))
      }
    },
    [refreshPlaylists, setQueue]
  )

  const handleRemoveTrackDownload = useCallback(
    async (track: Track) => {
      try {
        const updatedTrack = await window.loopify.downloads.removeTrackDownload(track.id)
        setQueue((current) => patchTrackInQueue(current, updatedTrack))
        setPlaylists((current) => patchTrackInPlaylists(current, updatedTrack))
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not remove that local file."))
      }
    },
    [setPlaylists, setQueue]
  )

  const handleDownloadPlaylist = useCallback(
    async (playlist: Playlist) => {
      try {
        const updated = await window.loopify.downloads.downloadPlaylist(playlist.id)
        setPlaylists(updated)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not start playlist downloads."))
      }
    },
    [setPlaylists]
  )

  const handlePlayPlaylist = useCallback(
    async (playlist: Playlist) => {
      if (!playlist.tracks || playlist.tracks.length === 0) return
      try {
        const sourceUrls = playlist.tracks.map((t) => t.canonicalUrl)
        const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: true })
        setQueue(next)
        await refreshPlaylists()
      } catch (err) {
        console.error("Failed to play playlist:", err)
        setActionError(formatActionError(err, "Could not play that playlist."))
      }
    },
    [refreshPlaylists, setQueue]
  )

  const handleShuffleQueue = useCallback(async () => {
    if (queue.length < 2) return
    try {
      const nextQ = await window.loopify.queue.shuffle()
      setQueue(nextQ)
    } catch (err) {
      console.error("Failed to shuffle queue:", err)
      setActionError(formatActionError(err, "Could not shuffle the queue."))
    }
  }, [queue.length, setQueue])

  const handleEnqueuePlaylist = useCallback(
    async (playlist: Playlist) => {
      if (!playlist.tracks || playlist.tracks.length === 0) return
      try {
        const sourceUrls = playlist.tracks.map((t) => t.canonicalUrl)
        const next = await window.loopify.queue.addMany({ sourceUrls, playFromStart: false })
        setQueue(next)
      } catch (err) {
        console.error("Failed to enqueue playlist:", err)
        setActionError(formatActionError(err, "Could not add that playlist to the queue."))
      }
    },
    [setQueue]
  )

  const handlePlayPause = useCallback(async () => {
    try {
      let nextState: PlayerState | null = null
      if (playerState?.status === "playing") {
        nextState = await window.loopify.player.pause()
      } else if (playerState?.status === "paused") {
        nextState = await window.loopify.player.resume()
      } else if (playerState?.queueItemId) {
        nextState = await window.loopify.player.play(playerState.queueItemId)
      }
      if (nextState) {
        lastPlayerState.current = nextState
        setPlayerState(nextState)
      }
      await refreshQueue()
      await refreshPlaylists()
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Playback could not be changed."))
    }
  }, [playerState, lastPlayerState, refreshPlaylists, refreshQueue, setPlayerState])

  const handleCycleRepeat = useCallback(async () => {
    try {
      const currentMode = lastPlayerState.current?.repeatMode ?? playerState?.repeatMode ?? "off"
      const nextState = await window.loopify.player.setRepeatMode(nextRepeatMode(currentMode))
      lastPlayerState.current = nextState
      setPlayerState(nextState)
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Could not change repeat mode."))
    }
  }, [lastPlayerState, playerState?.repeatMode, setPlayerState])

  const handleToggleCurrentLike = useCallback(() => {
    if (currentTrack) {
      void handleToggleLikeTrack(currentTrack)
    }
  }, [currentTrack, handleToggleLikeTrack])

  const handleDownloadCurrent = useCallback(() => {
    if (currentTrack) {
      void handleDownloadTrack(currentTrack)
    }
  }, [currentTrack, handleDownloadTrack])

  const handleRemoveCurrentDownload = useCallback(() => {
    if (currentTrack) {
      void handleRemoveTrackDownload(currentTrack)
    }
  }, [currentTrack, handleRemoveTrackDownload])

  const handleNext = useCallback(async () => {
    if (!hasNext) return
    try {
      const nextState = await window.loopify.player.play(queue[currentQueueIndex + 1].id)
      setPlayerState(nextState)
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Could not go to the next track."))
    }
  }, [currentQueueIndex, hasNext, queue, setPlayerState])

  const handlePrevious = useCallback(async () => {
    if (!hasPrevious) return
    try {
      const nextState = await window.loopify.player.play(queue[currentQueueIndex - 1].id)
      setPlayerState(nextState)
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Could not go to the previous track."))
    }
  }, [currentQueueIndex, hasPrevious, queue, setPlayerState])

  const handleSeek = useCallback(
    async (s: number) => {
      try {
        setPlayerState(await window.loopify.player.seek(s))
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not seek in the current track."))
      }
    },
    [setPlayerState]
  )

  const handleVolumeChange = useCallback(
    async (v: number) => {
      try {
        setPlayerState(await window.loopify.player.setVolume(v))
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not change volume."))
      }
    },
    [setPlayerState]
  )

  const onToggleQueue = useCallback(() => setIsQueueOpen((o) => !o), [setIsQueueOpen])

  const queueOnPlay = useCallback(
    async (item: QueueItem) => {
      try {
        const nextState = await window.loopify.player.play(item.id)
        setPlayerState(nextState)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not play that queue item."))
      }
    },
    [setPlayerState]
  )

  const queueOnRemove = useCallback(
    async (id: string) => {
      try {
        const nextQ = await window.loopify.queue.remove(id)
        setQueue(nextQ)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not remove that item from the queue."))
      }
    },
    [setQueue]
  )

  const queueOnClear = useCallback(async () => {
    try {
      const nextQ = await window.loopify.queue.clear()
      setQueue(nextQ)
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Could not clear the queue."))
    }
  }, [setQueue])

  const handleSeekRelative = useCallback(
    async (delta: number) => {
      const s = lastPlayerState.current
      if (!s?.queueItemId) return
      const pos = s.positionSeconds
      const d = s.durationSeconds
      const next = d != null ? Math.max(0, Math.min(d, pos + delta)) : Math.max(0, pos + delta)
      try {
        const st = await window.loopify.player.seek(next)
        lastPlayerState.current = st
        setPlayerState(st)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not seek in the current track."))
      }
    },
    [lastPlayerState, setPlayerState]
  )

  const handleSeekToStart = useCallback(async () => {
    const s = lastPlayerState.current
    if (!s?.queueItemId) return
    try {
      const st = await window.loopify.player.seek(0)
      lastPlayerState.current = st
      setPlayerState(st)
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Could not seek in the current track."))
    }
  }, [lastPlayerState, setPlayerState])

  const handleSeekNearEnd = useCallback(async () => {
    const s = lastPlayerState.current
    if (!s?.queueItemId) return
    const d = s.durationSeconds
    if (d == null || d <= 0) return
    const target = Math.max(0, d - NEAR_END_OFFSET_SEC)
    try {
      const st = await window.loopify.player.seek(target)
      lastPlayerState.current = st
      setPlayerState(st)
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Could not seek in the current track."))
    }
  }, [lastPlayerState, setPlayerState])

  const handleStop = useCallback(async () => {
    try {
      const st = await window.loopify.player.stop()
      lastPlayerState.current = st
      setPlayerState(st)
      await refreshQueue()
    } catch (err) {
      console.error(err)
      setActionError(formatActionError(err, "Could not stop playback."))
    }
  }, [lastPlayerState, refreshQueue, setPlayerState])

  const handleVolumeDelta = useCallback(
    async (delta: number) => {
      const s = lastPlayerState.current
      if (!s) return
      const v = Math.max(0, Math.min(100, (s.volume ?? 75) + delta))
      try {
        const st = await window.loopify.player.setVolume(v)
        lastPlayerState.current = st
        setPlayerState(st)
      } catch (err) {
        console.error(err)
        setActionError(formatActionError(err, "Could not change volume."))
      }
    },
    [lastPlayerState, setPlayerState]
  )

  const handleClearQueueShortcut = useCallback(async () => {
    if (queue.length === 0) return
    if (!window.confirm("Clear the entire queue? This cannot be undone.")) return
    await queueOnClear()
  }, [queue.length, queueOnClear])

  useAppKeyboardShortcuts({
    onOpenSearch: () => setIsSearchOpen(true),
    onOpenSettings: () => setIsSettingsOpen(true),
    onOpenImport: () => setIsImportOpen(true),
    onToggleQueue: onToggleQueue,
    onToggleSidebar: () => setIsSidebarExpanded((e) => !e),
    onNewPlaylist: handleCreatePlaylist,
    onPlayPause: () => {
      void handlePlayPause()
    },
    onNext: () => {
      void handleNext()
    },
    onPrevious: () => {
      void handlePrevious()
    },
    onStop: () => {
      void handleStop()
    },
    onSeekRelative: (delta) => {
      void handleSeekRelative(delta)
    },
    onSeekToStart: () => {
      void handleSeekToStart()
    },
    onSeekNearEnd: () => {
      void handleSeekNearEnd()
    },
    onVolumeDelta: (delta) => {
      void handleVolumeDelta(delta)
    },
    onShuffleQueue: () => {
      void handleShuffleQueue()
    },
    onClearQueue: () => {
      void handleClearQueueShortcut()
    },
    isSearchOpen,
    isSettingsOpen,
    isImportOpen,
    playlistActionOpen: playlistAction != null,
    canShuffleQueue: queue.length >= 2,
    hasNext,
    hasPrevious,
  })

  return (
    <div className="relative flex h-screen min-h-0 w-full flex-row overflow-hidden bg-canvas text-foreground">
      <AppErrorBanner message={actionError} onDismiss={clearActionError} />
      <NavRail
        isExpanded={isSidebarExpanded}
        onToggleExpand={() => setIsSidebarExpanded((e) => !e)}
        activePlaylistId={activePlaylistId}
        onGoToCollection={() => selectPlaylistWithTransition(null)}
        onSelectPlaylist={(id) => {
          selectPlaylistWithTransition(id)
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenImport={() => setIsImportOpen(true)}
        onCreatePlaylist={handleCreatePlaylist}
        queueLength={queue.length}
        isQueueOpen={isQueueOpen}
        onToggleQueue={onToggleQueue}
      />

      <div className="@container/shell relative flex min-h-0 min-w-0 flex-1 flex-row">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <Workspace
            activePlaylist={activePlaylist}
            playlists={playlists}
            hasFloatingPlayer={hasFloatingPlayer}
            onPlayTrack={handlePlayTrack}
            onSelectPlaylist={selectPlaylistWithTransition}
            onPlayPlaylist={handlePlayPlaylist}
            onEnqueuePlaylist={handleEnqueuePlaylist}
            onRequestRenamePlaylist={openRenamePlaylist}
            onRequestDeletePlaylist={openDeletePlaylist}
            onRemoveTrackFromPlaylist={handleRemoveFromPlaylist}
            onMovePlaylistTrack={handleMovePlaylistTrack}
            onEnqueuePlaylistTrack={handleEnqueuePlaylistTrack}
            onToggleLikeTrack={handleToggleLikeTrack}
            onDownloadTrack={handleDownloadTrack}
            onRemoveTrackDownload={handleRemoveTrackDownload}
            onDownloadPlaylist={handleDownloadPlaylist}
            onOpenSearch={() => setIsSearchOpen(true)}
            onOpenImport={() => setIsImportOpen(true)}
            onCreatePlaylist={handleCreatePlaylist}
          />

          {shouldRenderFloatingPlayer && (
            <div
              onTransitionEnd={onFloatingPlayerTransitionEnd}
              className={cn(
                "pointer-events-none absolute inset-0 z-30 transition-[opacity,transform,filter] duration-modal ease-out-quart motion-reduce:transition-none",
                showFloatingPlayer
                  ? "opacity-100 translate-y-0 scale-100 blur-0"
                  : "opacity-0 translate-y-4 scale-[0.985] blur-[6px]"
              )}
            >
              <FloatingIsland
                playerState={playerState}
                currentTrack={currentTrack}
                currentArtwork={currentArtwork ?? ""}
                currentArtist={currentArtist}
                onPlayPause={handlePlayPause}
                onNext={handleNext}
                onPrevious={handlePrevious}
                onSeek={handleSeek}
                onVolumeChange={handleVolumeChange}
                hasNext={hasNext}
                hasPrevious={hasPrevious}
                isQueueOpen={isQueueOpen}
                onToggleQueue={onToggleQueue}
                onShuffleQueue={() => void handleShuffleQueue()}
                canShuffleQueue={queue.length >= 2}
                onCycleRepeat={handleCycleRepeat}
                repeatMode={playerState?.repeatMode ?? "off"}
                onToggleCurrentLike={handleToggleCurrentLike}
                onDownloadCurrent={handleDownloadCurrent}
                onRemoveCurrentDownload={handleRemoveCurrentDownload}
              />
            </div>
          )}
        </div>

        <Suspense fallback={null}>
          <QueueOverlay
            compact={isCompactShell}
            isOpen={isQueueOpen}
            queue={queue}
            currentQueueItemId={playerState?.queueItemId ?? null}
            onPlay={queueOnPlay}
            onRemove={queueOnRemove}
            onClear={queueOnClear}
            onToggle={onToggleQueue}
            onToggleLikeTrack={handleToggleLikeTrack}
            onDownloadTrack={handleDownloadTrack}
            onRemoveTrackDownload={handleRemoveTrackDownload}
          />
        </Suspense>
      </div>

      <Suspense fallback={null}>
        <CommandPalette
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onPlayTrack={handlePlayTrack}
          onEnqueueTrack={handleEnqueueTrack}
          onLikeTrack={handleLikeCandidate}
          onDownloadTrack={handleDownloadCandidate}
        />
        <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
        <ImportModal
          isOpen={isImportOpen}
          onClose={() => setIsImportOpen(false)}
          onImportComplete={refreshPlaylists}
        />
        <PlaylistActionModal
          state={playlistAction}
          onDismiss={() => setPlaylistAction(null)}
          onSubmitCreate={submitPlaylistCreate}
          onSubmitRename={submitPlaylistRename}
          onSubmitDelete={submitPlaylistDelete}
        />
      </Suspense>
    </div>
  )
}
