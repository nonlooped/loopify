import { Loader2 } from "lucide-react"
import { lazy, Profiler, Suspense, useEffect } from "react"
import { AppErrorBanner } from "@/components/AppErrorBanner"
import { Button } from "@/components/Button"
import { UpdateBanner } from "@/components/UpdateBanner"
import { useOverlayPresence } from "@/hooks/useOverlayPresence"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { cn } from "@/lib/cn"
import { useAppKeyboardShortcuts } from "@/lib/keyboard-shortcuts"
import { useAppStore } from "@/stores/app.store"
import { NavRail } from "../../features/shell/NavRail"
import { TitleBar } from "../../features/shell/TitleBar"

const Workspace = lazy(() =>
  import("../../features/library/Workspace").then((m) => ({ default: m.Workspace }))
)
const FloatingIsland = lazy(() =>
  import("../../features/player/FloatingIsland").then((m) => ({ default: m.FloatingIsland }))
)
const ContextMenuRenderer = lazy(() =>
  import("@/components/ContextMenu").then((m) => ({ default: m.ContextMenuRenderer }))
)

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
const ShortcutsOverlay = lazy(() =>
  import("../../features/shell/ShortcutsOverlay").then((m) => ({
    default: m.ShortcutsOverlay,
  }))
)

function onRenderCallback(
  id: string,
  phase: "mount" | "update" | "nested-update",
  actualDuration: number,
  baseDuration: number
) {
  if (actualDuration > 16) {
    console.debug(
      `[perf] ${id}.${phase}`,
      actualDuration.toFixed(1),
      "ms",
      "(base:",
      baseDuration.toFixed(1),
      "ms)"
    )
  }
}

export function App() {
  const bootPhase = useAppStore((s) => s.bootPhase)
  const bootError = useAppStore((s) => s.bootError)
  const loadInitialData = useAppStore((s) => s.loadInitialData)
  const initSubscriptions = useAppStore((s) => s.initSubscriptions)
  const setShellReveal = useAppStore((s) => s.setShellReveal)
  const setActionError = useAppStore((s) => s.setActionError)
  const clearActionError = useAppStore((s) => s.clearActionError)
  const setIsCompactShell = useAppStore((s) => s.setIsCompactShell)

  const playerState = useAppStore((s) => s.playerState)
  const hasNext = useAppStore((s) => s.hasNext)
  const hasPrevious = useAppStore((s) => s.hasPrevious)
  const queue = useAppStore((s) => s.queue)
  const updateStatus = useAppStore((s) => s.updateStatus)
  const dismissedUpdatePhase = useAppStore((s) => s.dismissedUpdatePhase)
  const actionError = useAppStore((s) => s.actionError)
  const shellReveal = useAppStore((s) => s.shellReveal)
  const isCompactShell = useAppStore((s) => s.isCompactShell)
  const isSearchOpen = useAppStore((s) => s.isSearchOpen)
  const isSettingsOpen = useAppStore((s) => s.isSettingsOpen)
  const isImportOpen = useAppStore((s) => s.isImportOpen)
  const isShortcutsOpen = useAppStore((s) => s.isShortcutsOpen)
  const playlistAction = useAppStore((s) => s.playlistAction)

  const handlePlayPause = useAppStore((s) => s.handlePlayPause)
  const handleNext = useAppStore((s) => s.handleNext)
  const handlePrevious = useAppStore((s) => s.handlePrevious)
  const handleStop = useAppStore((s) => s.handleStop)
  const handleSeekRelative = useAppStore((s) => s.handleSeekRelative)
  const handleSeekToStart = useAppStore((s) => s.handleSeekToStart)
  const handleSeekNearEnd = useAppStore((s) => s.handleSeekNearEnd)
  const handleVolumeDelta = useAppStore((s) => s.handleVolumeDelta)
  const handleShuffleQueue = useAppStore((s) => s.handleShuffleQueue)
  const handleClearQueueShortcut = useAppStore((s) => s.handleClearQueueShortcut)
  const dismissUpdate = useAppStore((s) => s.dismissUpdate)
  const toggleSearch = useAppStore((s) => s.toggleSearch)
  const toggleSettings = useAppStore((s) => s.toggleSettings)
  const toggleImport = useAppStore((s) => s.toggleImport)
  const toggleShortcuts = useAppStore((s) => s.toggleShortcuts)
  const toggleQueue = useAppStore((s) => s.toggleQueue)
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const handleCreatePlaylist = useAppStore((s) => s.handleCreatePlaylist)

  const reducedMotion = usePrefersReducedMotion()

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
  }, [bootPhase, reducedMotion, setShellReveal])

  useEffect(() => {
    if (bootPhase !== "ready") return
    return initSubscriptions()
  }, [bootPhase, initSubscriptions])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 1600px), (max-height: 940px)")
    const applyViewportMode = () => setIsCompactShell(mediaQuery.matches)
    applyViewportMode()
    mediaQuery.addEventListener("change", applyViewportMode)
    return () => mediaQuery.removeEventListener("change", applyViewportMode)
  }, [setIsCompactShell])

  useEffect(() => {
    if (!actionError) return
    const t = window.setTimeout(() => setActionError(null), 8000)
    return () => window.clearTimeout(t)
  }, [actionError, setActionError])

  const hasFloatingPlayer =
    Boolean(playerState?.queueItemId) &&
    (playerState?.status === "playing" || playerState?.status === "paused")
  const {
    shouldRender: shouldRenderFloatingPlayer,
    showOverlay: showFloatingPlayer,
    onBackdropTransitionEnd: onFloatingPlayerTransitionEnd,
  } = useOverlayPresence(hasFloatingPlayer)

  useAppKeyboardShortcuts({
    onOpenSearch: () => toggleSearch(true),
    onOpenSettings: () => toggleSettings(true),
    onOpenImport: () => toggleImport(true),
    onOpenShortcuts: () => toggleShortcuts(true),
    onToggleQueue: () => toggleQueue(),
    onToggleSidebar: () => toggleSidebar(),
    onNewPlaylist: handleCreatePlaylist,
    onPlayPause: () => void handlePlayPause(),
    onNext: () => void handleNext(),
    onPrevious: () => void handlePrevious(),
    onStop: () => void handleStop(),
    onSeekRelative: (delta) => void handleSeekRelative(delta),
    onSeekToStart: () => void handleSeekToStart(),
    onSeekNearEnd: () => void handleSeekNearEnd(),
    onVolumeDelta: (delta) => void handleVolumeDelta(delta),
    onShuffleQueue: () => void handleShuffleQueue(),
    onClearQueue: () => void handleClearQueueShortcut(),
    isSearchOpen,
    isSettingsOpen,
    isImportOpen,
    isShortcutsOpen,
    playlistActionOpen: playlistAction != null,
    canShuffleQueue: queue.length >= 2,
    hasNext,
    hasPrevious,
  })

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

  const showUpdateBanner =
    updateStatus &&
    (updateStatus.phase === "available" ||
      updateStatus.phase === "downloading" ||
      updateStatus.phase === "downloaded") &&
    dismissedUpdatePhase !== updateStatus.phase

  return (
    <div
      className={cn("ol-app-fade h-full min-h-0 w-full", shellReveal ? "is-visible" : "is-hidden")}
    >
      <div className="relative flex h-screen min-h-0 w-full flex-row overflow-hidden bg-canvas text-foreground">
        <AppErrorBanner message={actionError} onDismiss={clearActionError} />
        {showUpdateBanner && (
          <UpdateBanner status={updateStatus} onDismiss={() => dismissUpdate()} />
        )}
        <NavRail />
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <TitleBar />
          <div className="@container/shell relative flex min-h-0 min-w-0 flex-1 flex-row">
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
              <Suspense fallback={null}>
                <Profiler id="Workspace" onRender={onRenderCallback}>
                  <Workspace />
                </Profiler>
              </Suspense>

              {shouldRenderFloatingPlayer && (
                <div
                  onTransitionEnd={onFloatingPlayerTransitionEnd}
                  className={cn(
                    "relative shrink-0 z-30 transition-[opacity,transform] duration-modal ease-out-quart motion-reduce:transition-none",
                    showFloatingPlayer
                      ? "opacity-100 translate-y-0"
                      : "opacity-0 translate-y-4 pointer-events-none"
                  )}
                >
                  <Suspense fallback={null}>
                    <Profiler id="FloatingIsland" onRender={onRenderCallback}>
                      <FloatingIsland />
                    </Profiler>
                  </Suspense>
                </div>
              )}
            </div>

            <Suspense fallback={null}>
              <Profiler id="QueueOverlay" onRender={onRenderCallback}>
                <QueueOverlay compact={isCompactShell} />
              </Profiler>
            </Suspense>
          </div>

          <Suspense fallback={null}>
            <CommandPalette />
            <SettingsModal />
            <ImportModal />
            <PlaylistActionModal />
            <ShortcutsOverlay open={isShortcutsOpen} onClose={() => toggleShortcuts(false)} />
          </Suspense>

          <Suspense fallback={null}>
            <ContextMenuRenderer />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
