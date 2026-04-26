import { cn } from "@/lib/cn"
import { LoopifyMark } from "./LoopifyMark"

type LoopifyWordmarkProps = {
  className?: string
  /** When false, only the typed lockup (no tile mark). */
  showMark?: boolean
  /** Rail header: mark matches nav icon tile (40px) so collapsed/expanded share one column. */
  compact?: boolean
  markClassName?: string
}

/** Typographic lockup: Loop + ify accent, optional gradient mark. */
export function LoopifyWordmark({
  className,
  showMark = true,
  compact = false,
  markClassName,
}: LoopifyWordmarkProps) {
  const text = (
    <span
      className={cn(
        "truncate select-none text-foreground",
        compact
          ? "text-[0.9375rem] font-semibold tracking-[-0.025em]"
          : "text-base font-semibold tracking-[-0.035em] sm:text-[1.125rem]"
      )}
    >
      Loop
      <span className="text-accent">ify</span>
    </span>
  )

  if (!showMark) {
    return (
      <div className={cn("flex min-w-0 items-center", compact ? "gap-3" : "gap-2.5", className)}>
        {text}
      </div>
    )
  }

  return (
    <div
      className={cn("flex min-w-0 items-center", compact ? "gap-3" : "gap-2.5", className)}
      role="img"
      aria-label="Loopify"
    >
      <span aria-hidden="true">
        <LoopifyMark
          className={cn(
            compact ? "h-10 w-10 shrink-0 rounded-xl" : "h-10 w-10 sm:h-12 sm:w-12",
            markClassName
          )}
          decorative
        />
      </span>
      <span aria-hidden="true">{text}</span>
    </div>
  )
}
