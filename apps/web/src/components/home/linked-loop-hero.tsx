import { useEffect, useState, type PointerEvent as ReactPointerEvent } from "react"
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"

const RING_STROKE = 30

/**
 * The "Linked Loop" backdrop. Two oversized rings (matching the brand
 * `oo` glyph) sit behind the hero copy, slowly spinning like vinyl records.
 * As the page scrolls they drift horizontally — linked, then apart, then
 * re-linked — and a subtle pointer tilt gives the pair a sense of depth.
 */
export function LinkedLoopHero({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion()
  const [vh, setVh] = useState(800)
  const { scrollY } = useScroll()

  useEffect(() => {
    const onResize = () => setVh(window.innerHeight)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Horizontal drift: 0 → 1 → 0 across the first ~180vh of scroll.
  const sep = useTransform(
    scrollY,
    [0, vh * 0.9, vh * 1.8],
    [0, 1, 0],
    { clamp: true },
  )
  const leftX = useTransform(sep, (s) => -60 - s * 140)
  const rightX = useTransform(sep, (s) => 60 + s * 140)

  // Pointer tilt: normalized -1..1 of pointer position, mapped to ±6deg.
  const pointerX = useMotionValue(0)
  const pointerY = useMotionValue(0)
  const tiltX = useSpring(useTransform(pointerY, [-1, 1], [6, -6]), {
    stiffness: 120,
    damping: 20,
    mass: 0.4,
  })
  const tiltY = useSpring(useTransform(pointerX, [-1, 1], [-6, 6]), {
    stiffness: 120,
    damping: 20,
    mass: 0.4,
  })

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (reduceMotion || event.pointerType !== "mouse") return
    const rect = event.currentTarget.getBoundingClientRect()
    const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1
    const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1
    pointerX.set(nx)
    pointerY.set(ny)
  }
  const handlePointerLeave = () => {
    if (reduceMotion) return
    pointerX.set(0)
    pointerY.set(0)
  }

  return (
    <div
      className="relative isolate"
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{ perspective: "1600px" }}
    >
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        style={
          reduceMotion
            ? undefined
            : { rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d" }
        }
      >
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div
            className="relative"
            style={{
              width: "min(92vw, 780px)",
              height: "min(62vw, 520px)",
            }}
          >
            <Ring motionX={leftX} direction={1} reduceMotion={!!reduceMotion} />
            <Ring motionX={rightX} direction={-1} reduceMotion={!!reduceMotion} />
            <Equalizer reduceMotion={!!reduceMotion} />
          </div>
        </div>
      </motion.div>

      <div className="relative">{children}</div>
    </div>
  )
}

type RingProps = {
  motionX: ReturnType<typeof useTransform<number, number>>
  direction: 1 | -1
  reduceMotion: boolean
}

function Ring({ motionX, direction, reduceMotion }: RingProps) {
  return (
    <motion.div
      className="absolute left-1/2 top-1/2 size-[min(62vw,420px)] -translate-x-1/2 -translate-y-1/2"
      style={{ x: motionX }}
    >
      <motion.svg
        viewBox="-200 -200 400 400"
        preserveAspectRatio="xMidYMid meet"
        className="size-full text-primary/15 dark:text-primary/25"
        aria-hidden="true"
        animate={reduceMotion ? undefined : { rotate: direction * 360 }}
        transition={
          reduceMotion
            ? undefined
            : { duration: 46, repeat: Infinity, ease: "linear" }
        }
      >
        <circle
          cx="0"
          cy="0"
          r="150"
          stroke="currentColor"
          strokeWidth={RING_STROKE}
          fill="none"
          vectorEffect="non-scaling-stroke"
        />
        {/* Small reference dot on the circumference — makes the rotation
            visible the way a label on a vinyl record does. */}
        <circle cx="0" cy="-150" r="7" fill="currentColor" />
      </motion.svg>
    </motion.div>
  )
}

const EQUALIZER_BARS = [
  { id: "bar-a", base: 0.55, step: 0 },
  { id: "bar-b", base: 1, step: 1 },
  { id: "bar-c", base: 0.7, step: 2 },
  { id: "bar-d", base: 0.4, step: 3 },
] as const

function Equalizer({ reduceMotion }: { reduceMotion: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-end gap-[3px]"
    >
      {EQUALIZER_BARS.map(({ id, base, step }) => (
        <motion.span
          key={id}
          className="block w-[3px] rounded-full bg-primary/45 dark:bg-primary/55"
          style={{ height: 32, transformOrigin: "bottom" }}
          initial={{ scaleY: base }}
          animate={
            reduceMotion
              ? { scaleY: base }
              : { scaleY: [base, 1, base * 0.5, base] }
          }
          transition={
            reduceMotion
              ? undefined
              : {
                  duration: 1.6 + step * 0.18,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: step * 0.09,
                }
          }
        />
      ))}
    </div>
  )
}
