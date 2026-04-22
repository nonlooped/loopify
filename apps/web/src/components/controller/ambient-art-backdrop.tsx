import { AnimatePresence, motion, useReducedMotion } from "motion/react"

type Props = {
  artworkUrl?: string
  encodedKey: string
  disabled?: boolean
}

/**
 * An oversized, heavily blurred copy of the current artwork fades in behind
 * the stage so the room takes on the mood of whatever is playing. The layer
 * is purely decorative and pointer-events-none; it's absolutely positioned
 * to the nearest positioned ancestor, and disabled entirely when there's no
 * artwork, we're inside an embed, or the user prefers reduced motion.
 */
export function AmbientArtBackdrop({ artworkUrl, encodedKey, disabled }: Props) {
  const reduceMotion = useReducedMotion()
  if (disabled || !artworkUrl) {
    return null
  }
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[min(60vh,700px)] overflow-hidden"
      style={{
        maskImage:
          "radial-gradient(ellipse 80% 70% at 50% 30%, black 0%, transparent 75%)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 70% at 50% 30%, black 0%, transparent 75%)",
      }}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={encodedKey || artworkUrl}
          initial={reduceMotion ? { opacity: 0.35 } : { opacity: 0 }}
          animate={{ opacity: 0.4 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
          transition={{
            duration: reduceMotion ? 0.12 : 1.1,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="absolute inset-0 dark:opacity-70"
        >
          <img
            src={artworkUrl}
            alt=""
            className="size-full scale-125 object-cover blur-3xl saturate-150"
            loading="eager"
            decoding="async"
          />
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
