import { Music2Icon } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

function formatTime(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms < 0) {
    return "0:00"
  }
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const sec = String(total % 60).padStart(2, "0")
  return `${m}:${sec}`
}

export type TrackRowProps = {
  title: string
  subtitle?: string
  artworkUrl?: string
  indexLabel?: string
  durationMs?: number
  requesterName?: string
  requesterAvatarUrl?: string
  active?: boolean
  onRowClick?: () => void
  actions?: React.ReactNode
  leading?: React.ReactNode
}

export function TrackRow(props: TrackRowProps) {
  const fallback = props.title.slice(0, 1).toUpperCase() || "?"
  const Wrapper = props.onRowClick ? "button" : "div"
  return (
    <Wrapper
      type={props.onRowClick ? "button" : undefined}
      onClick={props.onRowClick}
      className={cn(
        "group/row flex w-full items-center gap-3 border-l-2 border-l-transparent bg-background py-2.5 pr-2 pl-2 text-left transition-colors",
        "hover:border-l-brand hover:bg-muted/50",
        props.active && "border-l-brand bg-muted/40",
      )}
    >
      {props.leading ? (
        <span className="flex w-6 shrink-0 items-center justify-center text-muted-foreground">
          {props.leading}
        </span>
      ) : props.indexLabel ? (
        <span className="w-6 shrink-0 text-center font-mono text-[0.7rem] tabular-nums text-muted-foreground">
          {props.indexLabel}
        </span>
      ) : null}

      <div
        className={cn(
          "relative size-10 shrink-0 overflow-hidden rounded-md bg-muted ring-1 ring-black/5 dark:ring-white/10",
        )}
      >
        {props.artworkUrl ? (
          <img
            src={props.artworkUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Music2Icon className="size-4" />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm font-medium text-foreground",
            props.active && "text-brand",
          )}
        >
          {props.title}
        </p>
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {props.subtitle ? (
            <span className="truncate">{props.subtitle}</span>
          ) : null}
          {props.subtitle && props.requesterName ? (
            <span className="shrink-0 text-muted-foreground/60">·</span>
          ) : null}
          {props.requesterName ? (
            <span className="inline-flex min-w-0 shrink-0 items-center gap-1">
              <Avatar size="sm" className="size-4">
                {props.requesterAvatarUrl ? (
                  <AvatarImage src={props.requesterAvatarUrl} alt="" />
                ) : null}
                <AvatarFallback className="text-[9px]">
                  {fallback}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{props.requesterName}</span>
            </span>
          ) : null}
        </div>
      </div>

      {props.durationMs != null ? (
        <span className="hidden shrink-0 font-mono text-xs tabular-nums text-muted-foreground sm:inline">
          {formatTime(props.durationMs)}
        </span>
      ) : null}

      {props.actions ? (
        <div className="flex shrink-0 items-center gap-0.5">
          {props.actions}
        </div>
      ) : null}
    </Wrapper>
  )
}
