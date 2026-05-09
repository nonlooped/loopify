import { Disc3, Heart, Play, Plus, X } from "lucide-react"
import { memo } from "react"
import type { RecommendationItem } from "src/shared/contracts/ipc"
import { cn } from "@/lib/cn"
import { useAppStore } from "@/stores/app.store"

function ReasonTag({ text }: { text: string }) {
  return (
    <span className="type-meta inline-block rounded-full bg-white/5 px-2 py-0.5 text-subtle">
      {text}
    </span>
  )
}

export function DiscoverSection({
  title,
  subtitle,
  items,
  onDismiss,
  className,
}: {
  title: string
  subtitle?: string
  items: RecommendationItem[]
  onDismiss?: (track: RecommendationItem["track"]) => void
  className?: string
}) {
  const handlePlayTrack = useAppStore((s) => s.handlePlayTrack)
  const handleEnqueuePlaylistTrack = useAppStore((s) => s.handleEnqueuePlaylistTrack)
  const handleToggleLikeTrack = useAppStore((s) => s.handleToggleLikeTrack)
  if (items.length === 0) return null

  return (
    <section className={cn("mb-10", className)}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="type-title text-foreground">{title}</h2>
          {subtitle && <p className="type-meta mt-0.5 text-muted">{subtitle}</p>}
        </div>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory">
        {items.map((item) => (
          <DiscoverCard
            key={item.track.id}
            item={item}
            onPlay={() => {
              void handlePlayTrack(item.track)
            }}
            onEnqueue={() => {
              void handleEnqueuePlaylistTrack(item.track)
            }}
            onLike={() => {
              void handleToggleLikeTrack(item.track)
            }}
            onDismiss={
              onDismiss
                ? () => {
                    onDismiss(item.track)
                  }
                : undefined
            }
          />
        ))}
      </div>
    </section>
  )
}

export default DiscoverSection

const DiscoverCard = memo(function DiscoverCard({
  item,
  onPlay,
  onEnqueue,
  onLike,
  onDismiss,
}: {
  item: RecommendationItem
  onPlay: () => void
  onEnqueue: () => void
  onLike: () => void
  onDismiss?: () => void
}) {
  return (
    <div className="group w-40 shrink-0 snap-start sm:w-48">
      <div className="relative aspect-square overflow-hidden rounded-xl bg-raised shadow-md">
        {item.track.thumbnailUrl ? (
          <img
            src={item.track.thumbnailUrl}
            alt={item.track.title}
            className="h-full w-full object-cover transition-transform duration-ui ease-out-quart group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Disc3 className="h-10 w-10 text-muted" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 flex flex-col items-end justify-between bg-black/0 p-2.5 opacity-0 transition-all duration-ui ease-out-quart group-hover:bg-black/35 group-hover:opacity-100 motion-reduce:group-hover:opacity-0">
          <div className="flex gap-1.5">
            {onDismiss && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onDismiss()
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-foreground backdrop-blur-sm transition-colors hover:bg-black/70"
                aria-label={`Not interested in ${item.track.title}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex w-full items-center justify-between">
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEnqueue()
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-foreground backdrop-blur-sm transition-colors hover:bg-black/70"
                aria-label={`Add ${item.track.title} to queue`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onLike()
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/50 text-foreground backdrop-blur-sm transition-colors hover:bg-black/70"
                aria-label={`Like ${item.track.title}`}
              >
                <Heart className="h-3.5 w-3.5" />
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onPlay()
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-accent text-on-accent shadow-lg transition-all duration-ui ease-out-quart hover:scale-105 hover:bg-accent-bright active:scale-95 motion-reduce:hover:scale-100"
              aria-label={`Play ${item.track.title}`}
            >
              <Play className="ml-0.5 h-5 w-5 fill-current" />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2.5">
        <p className="type-body-sm truncate text-foreground">{item.track.title}</p>
        <p className="type-meta truncate text-muted">{item.track.artist ?? "Unknown artist"}</p>
        <div className="mt-1">
          <ReasonTag text={item.reason} />
        </div>
      </div>
    </div>
  )
})

export function CompactDiscoverList({
  title,
  subtitle,
  items,
  onDismiss,
}: {
  title: string
  subtitle: string
  items: RecommendationItem[]
  onDismiss?: (track: RecommendationItem["track"]) => void
}) {
  const handlePlayTrack = useAppStore((s) => s.handlePlayTrack)
  const handleEnqueuePlaylistTrack = useAppStore((s) => s.handleEnqueuePlaylistTrack)

  if (items.length === 0) return null

  return (
    <div className="rounded-2xl bg-raised/60 p-5">
      <div className="mb-4">
        <h3 className="type-label text-foreground">{title}</h3>
        <p className="type-meta text-muted">{subtitle}</p>
      </div>
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div
            key={item.track.id}
            className="group flex items-center gap-3 rounded-lg p-2 transition-colors duration-ui ease-out-quart hover:bg-white/5"
          >
            <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-raised">
              {item.track.thumbnailUrl ? (
                <img
                  src={item.track.thumbnailUrl}
                  alt={item.track.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Disc3 className="h-4 w-4 text-muted" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="type-label truncate text-foreground">{item.track.title}</p>
              <p className="type-meta truncate text-muted">
                {item.track.artist ?? "Unknown artist"}
              </p>
            </div>
            <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-ui ease-out-quart group-hover:opacity-100 motion-reduce:opacity-100">
              <button
                type="button"
                onClick={() => {
                  void handlePlayTrack(item.track)
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
                aria-label={`Play ${item.track.title}`}
              >
                <Play className="h-3.5 w-3.5 fill-current" />
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleEnqueuePlaylistTrack(item.track)
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
                aria-label={`Add ${item.track.title} to queue`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              {onDismiss && (
                <button
                  type="button"
                  onClick={() => onDismiss(item.track)}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:text-foreground"
                  aria-label={`Not interested in ${item.track.title}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
