import type { CSSProperties } from "react"

import { cn } from "@/lib/utils"

type WordmarkSize = "sm" | "md" | "lg" | "xl"

const sizeClass: Record<WordmarkSize, string> = {
  sm: "text-[0.95rem]",
  md: "text-base",
  lg: "text-2xl sm:text-3xl",
  xl: "text-5xl sm:text-6xl",
}

type WordmarkProps = {
  size?: WordmarkSize
  className?: string
  /**
   * Paints the interlocking "oo" rings in the brand color instead of the
   * surrounding text color. Reserve for marketing moments (hero, footer)
   * so the mark stays quiet in dense UI like headers.
   */
  accent?: boolean
}

/**
 * The Loopify brand wordmark. The "oo" is rendered as two linked rings so the
 * word itself carries the logo — no separate icon required.
 */
export function Wordmark({ size = "md", accent = false, className }: WordmarkProps) {
  return (
    <span
      role="img"
      aria-label="Loopify"
      className={cn(
        "inline-flex select-none items-baseline whitespace-nowrap font-sans font-semibold leading-none tracking-[-0.045em]",
        sizeClass[size],
        className,
      )}
    >
      <span aria-hidden="true">L</span>
      <LoopMark accent={accent} />
      <span aria-hidden="true">pify</span>
    </span>
  )
}

// viewBox 96x60 → aspect 1.6. The rings sit on the text baseline with the
// mark's height tuned to Geist's lowercase x-height so "oo" scans as letters.
const loopMarkStyle: CSSProperties = {
  width: "0.93em",
  height: "0.58em",
  verticalAlign: "0",
  marginInline: "0.01em",
}

function LoopMark({ accent }: { accent: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block", accent ? "text-primary" : "text-current")}
      style={loopMarkStyle}
    >
      <svg
        viewBox="0 0 96 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        role="presentation"
      >
        <title>Loopify</title>
        {/* Two overlapping rings form the "oo". The right ring is drawn last
            so it sits on top at the overlap, giving a subtle chain-link read
            while still scanning as a pair of lowercase o's. */}
        <circle
          cx="30"
          cy="30"
          r="24"
          stroke="currentColor"
          strokeWidth="12"
        />
        <circle
          cx="66"
          cy="30"
          r="24"
          stroke="currentColor"
          strokeWidth="12"
        />
      </svg>
    </span>
  )
}
