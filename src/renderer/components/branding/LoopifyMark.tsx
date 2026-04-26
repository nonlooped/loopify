import { cn } from "@/lib/cn"

const LOOP_GLYPH_D =
  "M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"

type LoopifyMarkProps = {
  className?: string
  title?: string
  /** When true, the mark is purely visual (e.g. beside a wordmark). */
  decorative?: boolean
}

/** App mark: infinity loop on accent gradient tile (pairs with public/favicon.svg). */
export function LoopifyMark({
  className,
  title = "Loopify",
  decorative = false,
}: LoopifyMarkProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-accent to-accent-bright shadow-sm",
        className
      )}
    >
      <svg
        className="h-[50%] w-[50%] text-on-accent"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        {...(decorative
          ? { "aria-hidden": true as const }
          : { role: "img" as const, "aria-label": title })}
      >
        <title>{title}</title>
        <path fill="currentColor" d={LOOP_GLYPH_D} />
      </svg>
    </div>
  )
}
