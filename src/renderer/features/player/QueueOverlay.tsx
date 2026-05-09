import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  CheckCircle2,
  Download,
  GripVertical,
  Heart,
  ListMusic,
  PanelRightClose,
  PanelRightOpen,
  Play,
  X,
} from "lucide-react"
import { memo, useEffect, useMemo, useRef } from "react"
import type { QueueItem, Track } from "src/shared/types/music"
import { EmptyState } from "@/components/EmptyState"
import { IconButton } from "@/components/IconButton"
import { cn } from "@/lib/cn"
import { buildTrackContextMenu } from "@/lib/context-menu-items"
import { downloadTitle } from "@/lib/music-format"
import { formatModShortcut } from "@/lib/shortcut"
import { navigateFromArtist, navigateFromTrack } from "@/lib/track-nav"
import { useAppStore } from "@/stores/app.store"
import { showContextMenu } from "@/stores/context-menu.store"

const VIRTUALIZATION_THRESHOLD = 120
const QUEUE_ROW_ESTIMATE = 60

interface QueueOverlayInnerProps {
  compact?: boolean
}

interface SortableQueueItemProps {
  item: QueueItem
  index: number
  virtualStyle?: React.CSSProperties
  isActive: boolean
  isOpen: boolean
  queueLength: number
  onPlay: (item: QueueItem) => void
  onRemove: (id: string) => void
  onToggleLikeTrack: (track: Track) => void
  onDownloadTrack: (track: Track) => void
  onRemoveTrackDownload: (track: Track) => void
}

const SortableQueueItem = memo(function SortableQueueItem({
  item,
  index,
  virtualStyle,
  isActive,
  isOpen,
  queueLength,
  onPlay,
  onRemove,
  onToggleLikeTrack,
  onDownloadTrack,
  onRemoveTrackDownload,
}: SortableQueueItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })

  const style: React.CSSProperties = {
    ...virtualStyle,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 1 : undefined,
  }

  const title = item.track?.title || item.sourceUrl
  const artist = item.track?.artist || "Unknown"
  const isLiked = Boolean(item.track?.likedAt)
  const isDownloaded = item.track?.downloadStatus === "downloaded"
  const isDownloadBusy =
    item.track?.downloadStatus === "queued" || item.track?.downloadStatus === "downloading"

  return (
    <li
      ref={setNodeRef}
      style={style}
      onContextMenu={(e) => {
        if (!item.track) return
        e.preventDefault()
        showContextMenu(
          e,
          buildTrackContextMenu({
            track: item.track as Track,
            showRemoveFromQueue: { queueItemId: item.id },
            showQueueMoveActions: true,
            queueItemCount: queueLength,
          })
        )
      }}
      className={cn(
        "group flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-ui ease-out-quart",
        isActive ? "bg-accent/10 text-foreground" : "hover:bg-white/5 text-muted",
        isDragging && "shadow-lg bg-surface-elevated"
      )}
    >
      {isOpen ? (
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-subtle hover:text-foreground shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => onPlay(item)}
        title={`${title} - ${artist}`}
        aria-label={`Play ${title}`}
        className={cn(
          "group/icon relative flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border transition-[transform,colors,opacity] duration-ui ease-out-quart hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:hover:scale-100",
          isActive
            ? "border-accent/40 bg-accent/12 shadow-[0_0_0_1px_oklch(from_var(--color-accent)_l_c_h_/_0.18)]"
            : "border-white/8 bg-white/[0.04] hover:border-white/14 hover:bg-white/[0.08]"
        )}
      >
        {item.track?.thumbnailUrl ? (
          <img
            src={item.track.thumbnailUrl}
            alt=""
            className={cn(
              "h-full w-full object-cover transition-opacity duration-ui ease-out-quart",
              isActive ? "opacity-55" : "opacity-95"
            )}
            loading={index < 8 ? "eager" : "lazy"}
            decoding="async"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-raised text-subtle">
            <ListMusic className="h-5 w-5" />
          </div>
        )}

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,oklch(from_var(--color-foreground)_l_c_h_/_0.12),transparent_40%,oklch(0_0_0/.18))]" />

        {isActive ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse motion-reduce:animate-none" />
          </div>
        ) : (
          <div className="absolute inset-0 hidden items-center justify-center bg-canvas/50 group-hover/icon:flex group-focus-visible/icon:flex">
            <Play className="h-4 w-4 fill-foreground text-foreground" />
          </div>
        )}
      </button>

      {isOpen ? (
        <>
          <div className="min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (item.track) void navigateFromTrack(item.track)
                }}
                disabled={!item.track}
                className={cn(
                  "type-body-sm block truncate text-nowrap animate-in-sidebar-copy cursor-pointer text-left hover:underline disabled:cursor-default disabled:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  isActive ? "text-accent" : "text-foreground"
                )}
              >
                {title}
              </button>
              {item.track?.downloadStatus === "downloaded" && (
                <CheckCircle2
                  className="h-3.5 w-3.5 shrink-0 text-accent/70 animate-in-sidebar-copy"
                  aria-label="Available offline"
                />
              )}
              {isDownloadBusy && (
                <span
                  className="h-3.5 w-3.5 shrink-0 animate-spin-slow rounded-full border border-accent/40 border-t-accent animate-in-sidebar-copy"
                  role="img"
                  aria-label="Downloading"
                />
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (item.track) void navigateFromArtist(item.track)
              }}
              disabled={!item.track}
              className="type-meta block truncate text-nowrap text-left text-muted cursor-pointer hover:text-foreground disabled:cursor-default disabled:hover:text-muted animate-in-sidebar-copy focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {artist}
            </button>
          </div>
          {item.track && (
            <>
              <IconButton
                size="sm"
                onClick={() => onToggleLikeTrack(item.track as Track)}
                aria-label={isLiked ? `Unlike ${title}` : `Like ${title}`}
                title={isLiked ? "Unlike song" : "Like song"}
                active={isLiked}
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              >
                <Heart className={cn("h-4 w-4", isLiked && "fill-current")} />
              </IconButton>
              <IconButton
                size="sm"
                onClick={() => {
                  if (!item.track) return
                  if (isDownloaded) onRemoveTrackDownload(item.track)
                  else onDownloadTrack(item.track)
                }}
                aria-label={isDownloaded ? `Remove download for ${title}` : `Download ${title}`}
                title={downloadTitle(item.track.downloadStatus, item.track.downloadProgress)}
                active={isDownloaded}
                disabled={isDownloadBusy}
                className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              >
                {isDownloaded ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </IconButton>
            </>
          )}
          <IconButton
            size="sm"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.track?.title || "queue item"} from queue`}
            title="Remove from queue"
            className="opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
          >
            <X className="h-4 w-4" />
          </IconButton>
        </>
      ) : null}
    </li>
  )
})

function QueueOverlayImpl({ compact = false }: QueueOverlayInnerProps) {
  const isOpen = useAppStore((s) => s.isQueueOpen)
  const queue = useAppStore((s) => s.queue)
  const currentQueueItemId = useAppStore((s) => s.playerState?.queueItemId) ?? null
  const queueOnPlay = useAppStore((s) => s.queueOnPlay)
  const queueOnRemove = useAppStore((s) => s.queueOnRemove)
  const queueOnReorder = useAppStore((s) => s.queueOnReorder)
  const queueOnClear = useAppStore((s) => s.queueOnClear)
  const toggleQueue = useAppStore((s) => s.toggleQueue)
  const handleToggleLikeTrack = useAppStore((s) => s.handleToggleLikeTrack)
  const handleDownloadTrack = useAppStore((s) => s.handleDownloadTrack)
  const handleRemoveTrackDownload = useAppStore((s) => s.handleRemoveTrackDownload)
  const confirmClear = useAppStore((s) => s.queueClearConfirming)
  const setQueueClearConfirming = useAppStore((s) => s.setQueueClearConfirming)

  useEffect(() => {
    if (!confirmClear) return
    const t = window.setTimeout(() => setQueueClearConfirming(false), 3000)
    return () => window.clearTimeout(t)
  }, [confirmClear, setQueueClearConfirming])

  useEffect(() => {
    if (!isOpen) setQueueClearConfirming(false)
  }, [isOpen, setQueueClearConfirming])

  const parentRef = useRef<HTMLDivElement>(null)
  const shouldVirtualize = queue.length > VIRTUALIZATION_THRESHOLD

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const virtualizer = useVirtualizer({
    count: queue.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => QUEUE_ROW_ESTIMATE,
    overscan: 8,
    enabled: shouldVirtualize,
  })

  const handleClear = () => {
    if (queue.length === 0) return
    if (!confirmClear) {
      setQueueClearConfirming(true)
      return
    }
    setQueueClearConfirming(false)
    void queueOnClear()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      queueOnReorder(
        String(active.id),
        queue.findIndex((item) => item.id === over.id)
      )
    }
  }

  const queueIds = useMemo(() => queue.map((item) => item.id), [queue])

  return (
    <>
      {compact && isOpen ? (
        <button
          type="button"
          className="cursor-pointer absolute inset-0 z-40 bg-canvas/60"
          aria-label="Close queue"
          onClick={() => toggleQueue()}
        />
      ) : null}
      <aside
        className={cn(
          "z-40 flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-surface shadow-panel motion-reduce:transition-none",
          compact
            ? "absolute inset-y-0 right-0 w-[min(24rem,calc(100vw-5.5rem))] max-w-full transition-[transform,opacity] duration-300 ease-out-quart"
            : "transition-[width] duration-300 ease-out-quart",
          compact
            ? isOpen
              ? "translate-x-0 opacity-100"
              : "pointer-events-none translate-x-full opacity-0"
            : isOpen
              ? "w-80 @[920px]/shell:w-96"
              : "w-20"
        )}
        aria-label="Playback queue"
      >
        <div className="px-2 pb-3 pt-6">
          <button
            type="button"
            onClick={() => toggleQueue()}
            title={isOpen ? "Collapse queue" : `Expand queue (${formatModShortcut("L")})`}
            aria-label={isOpen ? "Collapse queue" : "Expand queue"}
            className="cursor-pointer group flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-muted transition-colors duration-ui ease-out-quart hover:bg-white/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center">
              {isOpen ? (
                <PanelRightClose className="h-5 w-5 sm:h-6 sm:w-6" />
              ) : (
                <PanelRightOpen className="h-5 w-5 sm:h-6 sm:w-6" />
              )}
            </span>

            {isOpen ? (
              <>
                <div className="min-w-0 flex-1 overflow-hidden animate-in-sidebar-copy">
                  <h2 className="type-title m-0 truncate text-nowrap text-foreground">Up Next</h2>
                  <p className="type-meta mt-1 truncate text-nowrap text-subtle">
                    {queue.length === 0
                      ? "Queue is empty"
                      : `${queue.length} ${queue.length === 1 ? "track" : "tracks"} lined up`}
                  </p>
                </div>
                <span className="type-meta shrink-0 text-nowrap text-subtle animate-in-sidebar-copy">
                  {formatModShortcut("L")}
                </span>
              </>
            ) : null}
          </button>

          <button
            type="button"
            onClick={handleClear}
            disabled={queue.length === 0}
            title={!isOpen ? (confirmClear ? "Confirm clear queue" : "Clear queue") : undefined}
            aria-label={
              !isOpen ? (confirmClear ? "Confirm clear queue" : "Clear queue") : undefined
            }
            className={cn(
              "cursor-pointer mt-1 flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-ui ease-out-quart hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:pointer-events-none disabled:opacity-40",
              confirmClear ? "text-danger" : "text-muted hover:text-danger"
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center">
              <X className="h-4 w-4" />
            </span>
            {isOpen ? (
              <span className="type-body-sm min-w-0 flex-1 truncate text-nowrap text-foreground animate-in-sidebar-copy">
                {confirmClear ? "Confirm clear queue" : "Clear queue"}
              </span>
            ) : null}
          </button>
        </div>

        <div
          ref={parentRef}
          className="ol-queue-inner flex min-h-0 flex-1 flex-col px-2 pb-6 overflow-y-auto"
        >
          {queue.length === 0 ? (
            <div className={cn("flex flex-1 items-center", isOpen ? "px-3" : "justify-center")}>
              {isOpen ? (
                <EmptyState
                  className="w-full animate-in-sidebar-copy"
                  density="compact"
                  align="left"
                  icon={<ListMusic className="h-5 w-5" aria-hidden />}
                  eyebrow="Queue"
                  title="Nothing is lined up yet"
                  description={`Use Search (${formatModShortcut("K")}) to start playback or stage a few tracks for later.`}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-white/[0.035] text-subtle">
                  <ListMusic className="h-5 w-5 shrink-0" />
                </div>
              )}
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={queueIds} strategy={verticalListSortingStrategy}>
                {shouldVirtualize ? (
                  <ul
                    className="relative list-none p-0"
                    style={{ height: `${virtualizer.getTotalSize()}px` }}
                  >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                      const item = queue[virtualItem.index]
                      return (
                        <SortableQueueItem
                          key={item.id}
                          item={item}
                          index={virtualItem.index}
                          isActive={item.id === currentQueueItemId}
                          isOpen={isOpen}
                          queueLength={queue.length}
                          onPlay={queueOnPlay}
                          onRemove={queueOnRemove}
                          onToggleLikeTrack={handleToggleLikeTrack}
                          onDownloadTrack={handleDownloadTrack}
                          onRemoveTrackDownload={handleRemoveTrackDownload}
                          virtualStyle={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualItem.start}px)`,
                          }}
                        />
                      )
                    })}
                  </ul>
                ) : (
                  <ul className="flex list-none flex-col gap-1 p-0">
                    {queue.map((item, index) => (
                      <SortableQueueItem
                        key={item.id}
                        item={item}
                        index={index}
                        isActive={item.id === currentQueueItemId}
                        isOpen={isOpen}
                        queueLength={queue.length}
                        onPlay={queueOnPlay}
                        onRemove={queueOnRemove}
                        onToggleLikeTrack={handleToggleLikeTrack}
                        onDownloadTrack={handleDownloadTrack}
                        onRemoveTrackDownload={handleRemoveTrackDownload}
                      />
                    ))}
                  </ul>
                )}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </aside>
    </>
  )
}

export const QueueOverlay = memo(QueueOverlayImpl)
QueueOverlay.displayName = "QueueOverlay"
