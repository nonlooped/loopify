import { useRef } from "react"
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react"

/**
 * Scroll-linked 3D tilt-in. The wrapped content starts slightly tipped back
 * and sunk into the page, then flattens out and rises as it scrolls toward
 * the viewport center. Falls back to an identity transform under
 * prefers-reduced-motion.
 */
export function TiltIn({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  const ref = useRef<HTMLDivElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "center center"],
  })

  const rotateXRaw = useTransform(scrollYProgress, [0, 1], [8, 0])
  const yRaw = useTransform(scrollYProgress, [0, 1], [60, 0])
  const scaleRaw = useTransform(scrollYProgress, [0, 1], [0.96, 1])

  const rotateX = useSpring(rotateXRaw, { stiffness: 120, damping: 24, mass: 0.4 })
  const y = useSpring(yRaw, { stiffness: 120, damping: 24, mass: 0.4 })
  const scale = useSpring(scaleRaw, { stiffness: 120, damping: 24, mass: 0.4 })

  if (reduceMotion) {
    return (
      <div ref={ref} className={className}>
        {children}
      </div>
    )
  }

  return (
    <div ref={ref} className={className} style={{ perspective: "1600px" }}>
      <motion.div
        style={{
          rotateX,
          y,
          scale,
          transformStyle: "preserve-3d",
          transformOrigin: "center 85%",
          willChange: "transform",
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}
