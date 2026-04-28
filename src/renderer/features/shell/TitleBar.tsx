import { Minus, Square, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { useAppStore } from "@/stores/app.store"

/** Minimal SVG icon for the "restore down" window state (two overlapping rectangles). */
function RestoreIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <title>Restore</title>
      <rect x="3" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5 5V3.5A1.5 1.5 0 0 1 6.5 2H12.5A1.5 1.5 0 0 1 14 3.5V9.5A1.5 1.5 0 0 1 12.5 11H11"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </svg>
  )
}

export function TitleBar() {
  const playerState = useAppStore((s) => s.playerState)
  const queue = useAppStore((s) => s.queue)
  const currentQueueItem = queue.find((q) => q.id === playerState?.queueItemId)
  const currentArtwork = currentQueueItem?.track?.thumbnailUrl ?? null
  const currentArtist = currentQueueItem?.track?.artist || "..."
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    void window.loopify.window.isMaximized().then(setIsMaximized)
    const unsub = window.loopify.window.onMaximizedChange(setIsMaximized)
    return unsub
  }, [])

  const handleMinimize = useCallback(() => window.loopify.window.minimize(), [])
  const handleMaximizeToggle = useCallback(() => {
    if (isMaximized) {
      window.loopify.window.unmaximize()
    } else {
      window.loopify.window.maximize()
    }
  }, [isMaximized])
  const handleClose = useCallback(() => window.loopify.window.close(), [])

  const isPlaying = playerState?.status === "playing"
  const isPaused = playerState?.status === "paused"
  const hasTrack = isPlaying || isPaused
  const title = playerState?.title ?? null
  const trackKey = hasTrack ? `${playerState?.queueItemId}-${title}` : null

  return (
    <header
      id="app-titlebar"
      className="titlebar relative z-[200] flex h-9 w-full shrink-0 select-none items-center"
    >
      {/* Drag region – fills the entire bar, sits beneath interactive elements */}
      <div className="titlebar-drag pointer-events-auto absolute inset-0" />

      {/* ── Center: now-playing (absolutely centered in the bar) ────── */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {hasTrack && trackKey ? (
          <div
            key={trackKey}
            className="titlebar-nodrag titlebar-track pointer-events-auto flex max-w-[60%] items-center gap-2 overflow-hidden rounded-md px-2 py-0.5"
          >
            {/* Tiny artwork thumbnail */}
            {currentArtwork ? (
              <img
                src={currentArtwork}
                alt=""
                className="h-4.5 w-4.5 shrink-0 rounded-[3px] object-cover"
                decoding="async"
                draggable={false}
              />
            ) : null}

            {/* Track info */}
            <span className="truncate text-[11px] font-medium leading-none tracking-tight text-foreground/70">
              {title}
            </span>
            {currentArtist && currentArtist !== "..." ? (
              <>
                <span className="shrink-0 text-[10px] text-foreground/20" aria-hidden>
                  ·
                </span>
                <span className="truncate text-[10.5px] leading-none tracking-tight text-foreground/35">
                  {currentArtist}
                </span>
              </>
            ) : null}

            {/* Playing indicator: pulsing dot */}
            {isPlaying ? (
              <span className="titlebar-playing-dot ml-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent-bright" />
            ) : null}
          </div>
        ) : null}
      </div>

      {/* ── Right: window controls ───────────────────────────────────── */}
      <div className="titlebar-nodrag relative z-10 ml-auto flex h-full shrink-0 items-stretch">
        <button
          type="button"
          className="titlebar-btn titlebar-btn-minimize"
          onClick={handleMinimize}
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-maximize"
          onClick={handleMaximizeToggle}
          aria-label={isMaximized ? "Restore" : "Maximize"}
          title={isMaximized ? "Restore" : "Maximize"}
        >
          {isMaximized ? (
            <RestoreIcon className="h-3 w-3" />
          ) : (
            <Square className="h-2.5 w-2.5" strokeWidth={1.5} />
          )}
        </button>
        <button
          type="button"
          className="titlebar-btn titlebar-btn-close"
          onClick={handleClose}
          aria-label="Close"
          title="Close"
        >
          <X className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </header>
  )
}
