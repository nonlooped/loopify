import {
  Captions,
  CheckCircle2,
  ChevronDown,
  Download,
  Heart,
  ListMusic,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import type { PlayerState, RepeatMode, Track } from "src/shared/types/music"
import { IconButton } from "@/components/IconButton"
import { Slider } from "@/components/Slider"
import { cn } from "@/lib/cn"
import { DRAG_MIME_TYPES } from "@/lib/drag-drop"
import { modArrowHint, playPauseHint } from "@/lib/keyboard-shortcuts"
import { downloadTitle } from "@/lib/music-format"
import { formatModShortcut, isMacLike } from "@/lib/shortcut"
import { SyncedLyricsView } from "./SyncedLyricsView"

interface FloatingIslandProps {
  playerState: PlayerState | null
  currentTrack: Track | null
  currentArtwork?: string
  currentArtist: string
  onPlayPause: () => void
  onNext: () => void
  onPrevious: () => void
  onSeek: (s: number) => void
  onVolumeChange: (v: number) => void
  hasNext: boolean
  hasPrevious: boolean
  onToggleQueue: () => void
  isQueueOpen: boolean
  onShuffleQueue: () => void
  canShuffleQueue: boolean
  onCycleRepeat: () => void
  repeatMode: RepeatMode
  onToggleCurrentLike: () => void
  onDownloadCurrent: () => void
  onRemoveCurrentDownload: () => void
}

export function FloatingIsland({
  playerState,
  currentTrack,
  currentArtwork,
  currentArtist,
  onPlayPause,
  onNext,
  onPrevious,
  onSeek,
  onVolumeChange,
  hasNext,
  hasPrevious,
  onToggleQueue,
  isQueueOpen,
  onShuffleQueue,
  canShuffleQueue,
  onCycleRepeat,
  repeatMode,
  onToggleCurrentLike,
  onDownloadCurrent,
  onRemoveCurrentDownload,
}: FloatingIslandProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [expandedMode, setExpandedMode] = useState<"artwork" | "lyrics">("artwork")

  const isPlaying = playerState?.status === "playing"
  const title = playerState?.title || "Not Playing"
  const duration = playerState?.durationSeconds || 0
  const position = playerState?.positionSeconds || 0
  const volume = playerState?.volume ?? 100
  const hasTrack = Boolean(playerState?.queueItemId)
  const isLiked = Boolean(currentTrack?.likedAt)
  const downloadStatus = currentTrack?.downloadStatus ?? "not-downloaded"
  const downloadProgress = currentTrack?.downloadProgress ?? 0
  const isDownloadBusy = downloadStatus === "queued" || downloadStatus === "downloading"

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const trackKey = playerState?.queueItemId
    ? `${playerState.queueItemId}-${title}`
    : `idle-${title}`
  const repeatLabel =
    repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat queue" : "Repeat off"
  const RepeatIcon = repeatMode === "one" ? Repeat1 : Repeat
  const downloadAction =
    downloadStatus === "downloaded" ? onRemoveCurrentDownload : onDownloadCurrent

  useEffect(() => {
    if (!hasTrack) {
      setIsExpanded(false)
      setExpandedMode("artwork")
    }
  }, [hasTrack])

  useEffect(() => {
    if (!isExpanded) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false)
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isExpanded])

  return (
    <div className="relative w-full">
      {createPortal(
        <div className={cn("fixed inset-0 z-50", !isExpanded && "pointer-events-none")}>
          <div
            className={cn(
              "pointer-events-none absolute inset-0 bg-canvas/0 opacity-0 transition-opacity duration-modal ease-out-quart",
              isExpanded && "pointer-events-auto bg-canvas/28 opacity-100 backdrop-blur-[2px]"
            )}
            aria-hidden={!isExpanded}
            onClick={() => setIsExpanded(false)}
          />

          <div className="pointer-events-none absolute inset-x-3 inset-y-3 sm:inset-x-4 sm:inset-y-4 md:inset-y-5">
            <div
              className={cn(
                "ol-now-playing-panel pointer-events-auto absolute inset-0 overflow-hidden rounded-[2rem] border border-white/10 bg-surface/94 shadow-island backdrop-blur-3xl sm:rounded-[2.5rem]",
                isExpanded ? "ol-open" : "pointer-events-none"
              )}
            >
              <div className="relative flex h-full flex-col overflow-hidden px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5 lg:px-8 lg:pb-8 lg:pt-6">
                {currentArtwork ? (
                  <>
                    <img
                      src={currentArtwork}
                      alt=""
                      className="pointer-events-none absolute inset-x-8 top-6 h-[min(34vh,20rem)] w-auto rounded-[2rem] object-cover opacity-18 blur-3xl sm:inset-x-12 sm:top-8 sm:h-[min(38vh,24rem)] lg:inset-x-16 lg:top-10 lg:h-[min(44vh,30rem)]"
                    />
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,oklch(1_0_0/.08),transparent_54%)]" />
                  </>
                ) : null}

                <div className="relative flex items-start justify-between gap-4">
                  <p className="type-meta m-0 text-subtle">Now Playing</p>
                  <div className="flex items-center gap-2">
                    <IconButton
                      size="md"
                      onClick={onToggleCurrentLike}
                      title={isLiked ? "Unlike current song" : "Like current song"}
                      active={isLiked}
                      disabled={!currentTrack}
                    >
                      <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
                    </IconButton>
                    <IconButton
                      size="md"
                      onClick={downloadAction}
                      title={downloadTitle(downloadStatus, downloadProgress)}
                      active={downloadStatus === "downloaded"}
                      disabled={!currentTrack || isDownloadBusy}
                    >
                      {downloadStatus === "downloaded" ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Download className="h-5 w-5" />
                      )}
                    </IconButton>
                    <IconButton
                      size="md"
                      onClick={() =>
                        setExpandedMode((mode) => (mode === "lyrics" ? "artwork" : "lyrics"))
                      }
                      title={expandedMode === "lyrics" ? "Show artwork" : "Show synced lyrics"}
                      active={expandedMode === "lyrics"}
                      disabled={!hasTrack}
                    >
                      <Captions className="h-5 w-5" />
                    </IconButton>
                    <IconButton
                      size="md"
                      onClick={() => setIsExpanded(false)}
                      title="Collapse now playing"
                    >
                      <ChevronDown className="h-5 w-5" />
                    </IconButton>
                  </div>
                </div>

                <div
                  className={cn(
                    "relative flex min-h-0 flex-1 flex-col text-center",
                    expandedMode === "lyrics" ? "justify-start" : "items-center justify-center"
                  )}
                >
                  {expandedMode === "lyrics" ? (
                    <SyncedLyricsView
                      track={playerState?.track ?? null}
                      positionSeconds={position}
                      onSeek={onSeek}
                    />
                  ) : (
                    <>
                      <div
                        key={trackKey}
                        className="now-playing-swap w-full max-w-[min(28vh,14rem)] sm:max-w-[min(30vh,18rem)] lg:max-w-[min(34vh,22rem)] xl:max-w-[min(36vh,24rem)]"
                      >
                        <div className="aspect-square overflow-hidden rounded-[1.75rem] bg-raised/85 shadow-[0_24px_60px_-24px_oklch(0_0_0/.65)]">
                          {currentArtwork ? (
                            <img
                              src={currentArtwork}
                              alt=""
                              className="h-full w-full object-cover"
                              decoding="async"
                              fetchPriority="high"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(180deg,oklch(1_0_0/.04),transparent)]">
                              <div className="h-14 w-14 rounded-full bg-border" />
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 flex max-w-[36rem] flex-col items-center gap-1.5 sm:mt-6 sm:gap-2">
                        <h2
                          className="m-0 text-balance text-[clamp(1.625rem,3.6vw,2.4rem)] font-semibold tracking-[-0.035em] text-foreground"
                          title={title}
                        >
                          {title}
                        </h2>
                        <p
                          className="type-body-sm m-0 max-w-[28rem] truncate text-muted"
                          title={currentArtist}
                        >
                          {currentArtist}
                        </p>
                      </div>
                    </>
                  )}

                  <div className="mt-4 flex w-full max-w-[44rem] min-w-0 items-center gap-2 self-center sm:mt-6 sm:gap-3">
                    <span className="type-meta w-10 shrink-0 text-right tabular-nums text-subtle sm:text-[0.8125rem]">
                      {formatTime(position)}
                    </span>
                    <Slider
                      className="min-w-0 flex-1"
                      max={duration || 100}
                      value={position}
                      onChange={(e) => onSeek(Number(e.target.value))}
                      disabled={!duration}
                      title="Seek (arrows: ±5s, Shift+arrows: ±30s, Home/End, or drag)"
                    />
                    <span className="type-meta w-10 shrink-0 tabular-nums text-subtle sm:text-[0.8125rem]">
                      {formatTime(duration)}
                    </span>
                  </div>

                  <div className="mb-3 mt-4 flex items-center justify-center gap-3 sm:mb-5 sm:mt-6 sm:gap-4">
                    <IconButton
                      onClick={onPrevious}
                      disabled={!hasPrevious}
                      title={`Previous track (${modArrowHint("left")})`}
                      className="h-11 w-11 rounded-full bg-white/4 sm:h-12 sm:w-12"
                    >
                      <SkipBack className="h-5 w-5 fill-current sm:h-6 sm:w-6" />
                    </IconButton>
                    <button
                      type="button"
                      onClick={onPlayPause}
                      title={playPauseHint()}
                      className="cursor-pointer flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-foreground text-canvas transition-transform duration-press ease-out-quart hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100 sm:h-16 sm:w-16 lg:h-18 lg:w-18"
                    >
                      {isPlaying ? (
                        <Pause className="h-6 w-6 fill-current sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
                      ) : (
                        <Play className="ml-0.5 h-6 w-6 fill-current sm:ml-1 sm:h-7 sm:w-7 lg:h-8 lg:w-8" />
                      )}
                    </button>
                    <IconButton
                      onClick={onNext}
                      disabled={!hasNext}
                      title={`Next track (${modArrowHint("right")})`}
                      className="h-11 w-11 rounded-full bg-white/4 sm:h-12 sm:w-12"
                    >
                      <SkipForward className="h-5 w-5 fill-current sm:h-6 sm:w-6" />
                    </IconButton>
                  </div>
                </div>

                <div className="relative flex w-full justify-center border-t border-white/10 pt-3 sm:pt-4">
                  <div className="flex w-full max-w-[44rem] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 items-center gap-3 sm:w-44">
                      <Volume2 className="h-4 w-4 shrink-0 text-muted" />
                      <Slider
                        className="min-w-0 flex-1"
                        max={100}
                        value={volume}
                        onChange={(e) => onVolumeChange(Number(e.target.value))}
                        title={isMacLike() ? "Volume (⌘↑ / ⌘↓)" : "Volume (Ctrl+Up / Ctrl+Down)"}
                      />
                    </div>
                    <div className="flex items-center justify-center gap-2 sm:justify-end">
                      <IconButton
                        size="md"
                        title={repeatLabel}
                        onClick={onCycleRepeat}
                        active={repeatMode !== "off"}
                      >
                        <RepeatIcon className="h-5 w-5" />
                      </IconButton>
                      <IconButton
                        size="md"
                        title={isMacLike() ? "Shuffle queue (⌘⇧H)" : "Shuffle queue (Ctrl+Shift+H)"}
                        onClick={onShuffleQueue}
                        disabled={!canShuffleQueue}
                      >
                        <Shuffle className="h-5 w-5" />
                      </IconButton>
                      <IconButton
                        size="md"
                        title={`Up Next (${formatModShortcut("L")})`}
                        onClick={onToggleQueue}
                        active={isQueueOpen}
                      >
                        <ListMusic className="h-5 w-5" />
                      </IconButton>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="relative w-full px-3 pb-4 sm:px-4 sm:pb-6 md:pb-8 flex justify-center">
        <div
          className={cn(
            "ol-now-playing-dock pointer-events-auto group relative flex w-full min-w-0 max-w-full flex-col gap-4 rounded-2xl border border-white/8 bg-surface/95 p-3 shadow-island backdrop-blur-2xl hover:border-white/14 hover:bg-white/[0.075] xl:max-w-6xl xl:flex-row xl:items-center xl:gap-6",
            isExpanded && "pointer-events-none is-hidden"
          )}
        >
          <button
            type="button"
            className="absolute inset-0 rounded-2xl cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-default"
            aria-label={hasTrack ? "Open now playing" : undefined}
            onClick={() => hasTrack && setIsExpanded(true)}
            disabled={!hasTrack}
          />

          <div className="now-playing-swap pointer-events-none relative z-10 flex min-w-0 items-center gap-3 overflow-hidden rounded-xl text-left sm:gap-4 xl:w-[min(20rem,28%)] xl:flex-none">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle is mouse-only by HTML5 DnD spec; track is added via menus elsewhere for keyboard users */}
            <div
              className={cn(
                "h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-canvas sm:h-16 sm:w-16",
                currentTrack && "pointer-events-auto cursor-grab active:cursor-grabbing"
              )}
              draggable={Boolean(currentTrack)}
              onDragStart={(e) => {
                if (!currentTrack) return
                e.dataTransfer.setData(DRAG_MIME_TYPES.TRACK, JSON.stringify(currentTrack))
                e.dataTransfer.effectAllowed = "copy"
              }}
              title={currentTrack ? "Drag to a playlist to add this track" : undefined}
            >
              {currentArtwork ? (
                <img
                  src={currentArtwork}
                  alt=""
                  className="pointer-events-none h-full w-full object-cover"
                  decoding="async"
                  fetchPriority="high"
                  draggable={false}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <div className="h-6 w-6 rounded-full bg-border" />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col overflow-hidden py-1 pr-1">
              <span
                className="truncate text-[0.9375rem] font-semibold tracking-[-0.018em] text-foreground sm:text-base"
                title={title}
              >
                {title}
              </span>
              <span className="type-meta truncate text-muted" title={currentArtist}>
                {currentArtist}
              </span>
            </div>
          </div>

          <div className="pointer-events-none relative z-10 flex min-w-0 flex-col items-stretch gap-2 xl:min-w-72 xl:flex-1 xl:px-4">
            <div className="pointer-events-auto flex items-center justify-center gap-3 sm:gap-4">
              <IconButton
                size="md"
                onClick={onPrevious}
                disabled={!hasPrevious}
                title={`Previous track (${modArrowHint("left")})`}
              >
                <SkipBack className="h-5 w-5 fill-current" />
              </IconButton>
              <button
                type="button"
                onClick={onPlayPause}
                title={playPauseHint()}
                className="cursor-pointer flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-foreground text-canvas transition-transform duration-press ease-out-quart hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100"
              >
                {isPlaying ? (
                  <Pause className="h-6 w-6 fill-current" />
                ) : (
                  <Play className="ml-1 h-6 w-6 fill-current" />
                )}
              </button>
              <IconButton
                size="md"
                onClick={onNext}
                disabled={!hasNext}
                title={`Next track (${modArrowHint("right")})`}
              >
                <SkipForward className="h-5 w-5 fill-current" />
              </IconButton>
            </div>
            <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3">
              <span className="type-meta w-9 shrink-0 text-right tabular-nums text-subtle sm:w-10">
                {formatTime(position)}
              </span>
              <Slider
                className="pointer-events-auto min-w-0 flex-1"
                max={duration || 100}
                value={position}
                onChange={(e) => onSeek(Number(e.target.value))}
                disabled={!duration}
                title="Seek (arrows: ±5s, Shift+arrows: ±30s, Home/End, or drag)"
              />
              <span className="type-meta w-9 shrink-0 tabular-nums text-subtle sm:w-10">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          <div className="pointer-events-none relative z-10 flex min-w-0 shrink-0 flex-col items-stretch gap-2 border-t border-border/50 pt-3 md:flex-row md:items-center md:justify-between md:gap-3 xl:border-l xl:border-t-0 xl:pl-6 xl:pr-1 xl:pt-0">
            <div className="pointer-events-auto flex w-full min-w-0 items-center gap-2 md:max-w-44 md:flex-1 xl:w-28">
              <Volume2 className="h-4 w-4 shrink-0 text-muted" />
              <Slider
                className="pointer-events-auto min-w-0 flex-1"
                max={100}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                title={isMacLike() ? "Volume (⌘↑ / ⌘↓)" : "Volume (Ctrl+Up / Ctrl+Down)"}
              />
            </div>
            <div className="pointer-events-auto flex shrink-0 items-center gap-1 self-end md:self-auto sm:gap-2">
              <IconButton
                size="md"
                onClick={onToggleCurrentLike}
                title={isLiked ? "Unlike current song" : "Like current song"}
                active={isLiked}
                disabled={!currentTrack}
              >
                <Heart className={cn("h-5 w-5", isLiked && "fill-current")} />
              </IconButton>
              <IconButton
                size="md"
                onClick={downloadAction}
                title={downloadTitle(downloadStatus, downloadProgress)}
                active={downloadStatus === "downloaded"}
                disabled={!currentTrack || isDownloadBusy}
              >
                {downloadStatus === "downloaded" ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Download className="h-5 w-5" />
                )}
              </IconButton>
              <IconButton
                size="md"
                title={`Up Next (${formatModShortcut("L")})`}
                onClick={onToggleQueue}
                active={isQueueOpen}
              >
                <ListMusic className="h-5 w-5" />
              </IconButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
