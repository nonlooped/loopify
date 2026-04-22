import { cn } from "@/lib/utils"

/**
 * A simplified echo of the home page's "Linked Loop" rings. Used as the
 * artwork fallback inside the stage, so an idle room still feels like the
 * brand rather than a generic music glyph.
 */
export function BrandRings({ className }: { className?: string }) {
  return (
    <svg
      viewBox="-120 -60 240 120"
      aria-hidden="true"
      className={cn("size-full text-brand/25", className)}
    >
      <circle
        cx="-40"
        cy="0"
        r="42"
        stroke="currentColor"
        strokeWidth="9"
        fill="none"
      />
      <circle
        cx="40"
        cy="0"
        r="42"
        stroke="currentColor"
        strokeWidth="9"
        fill="none"
      />
    </svg>
  )
}
