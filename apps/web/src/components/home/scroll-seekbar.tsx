import type { RefObject } from "react"
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"

const SECTION_TICKS = [0.25, 0.5, 0.75] as const

/**
 * A thin music-scrubber fixed under the site header that fills as the home
 * page scrolls. Small dots mark the three boundaries between the four page
 * sections, and a playhead dot rides the leading edge of the fill.
 *
 * Rendered inside `HomePage` so it is naturally scoped — it does not appear
 * on /controller, /commands, or /login.
 */
export function ScrollSeekbar({
  targetRef,
}: {
  targetRef: RefObject<HTMLElement | null>
}) {
  const reduceMotion = useReducedMotion()
  const { scrollYProgress } = useScroll({
    target: targetRef,
    offset: ["start start", "end end"],
  })
  const smooth = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.3,
  })
  const progress = reduceMotion ? scrollYProgress : smooth
  const playheadLeft = useTransform(progress, (v) => `${v * 100}%`)

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-50"
    >
      <div className="relative h-px w-full bg-border/50">
        <motion.div
          className="absolute inset-y-0 left-0 w-full origin-left bg-primary"
          style={{ scaleX: progress }}
        />
        {SECTION_TICKS.map((pos) => (
          <span
            key={pos}
            className="absolute top-1/2 block size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-border"
            style={{ left: `${pos * 100}%` }}
          />
        ))}
        <motion.span
          className="absolute top-1/2 block size-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-background"
          style={{ left: playheadLeft }}
        />
      </div>
    </div>
  )
}
