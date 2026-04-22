import { AnimatePresence, motion, useReducedMotion } from "motion/react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { QueueItem } from "@/lib/contracts"

import { BrandRings } from "./brand-rings"

type Props = {
  current: QueueItem | null | undefined
  playing: boolean
  paused: boolean
  volumePct: number
  /** When true, the hero stays center-aligned even on wider containers. */
  forceCentered?: boolean
}

function requesterInitial(name?: string, id?: string | null): string {
  if (name && name.length > 0) {
    return name.slice(0, 1).toUpperCase()
  }
  if (id && id.length > 0) {
    return id.slice(0, 1).toUpperCase()
  }
  return "?"
}

export function NowPlayingHero({
  current,
  playing,
  paused,
  volumePct,
  forceCentered,
}: Props) {
  const reduceMotion = useReducedMotion()
  const artworkUrl = current?.info.artworkUrl
  const encodedKey = current?.encoded ?? current?.info.identifier ?? "idle"
  const alignCluster = forceCentered
    ? "items-center text-center"
    : "items-center text-center @lg/stage:items-start @lg/stage:text-left"
  const alignMeta = forceCentered
    ? "items-center"
    : "items-center @lg/stage:items-start"

  const statusLabel = paused ? "Paused" : current ? "Now playing" : "Idle"
  const statusDotClass = paused
    ? "bg-muted-foreground"
    : current
      ? "bg-brand"
      : "bg-muted-foreground"

  const requesterName = current?.requesterName
  const requesterAvatarUrl = current?.requesterAvatarUrl

  return (
    <div className={cn("flex flex-col", alignCluster)}>
      <motion.div
        className="relative"
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.45,
          ease: [0.22, 1, 0.36, 1],
          delay: reduceMotion ? 0 : 0.04,
        }}
      >
        <div
          className={cn(
            "relative overflow-hidden rounded-2xl bg-muted/40 ring-1 ring-black/10 dark:ring-white/10",
            "size-56 sm:size-64 lg:size-72 @xl/stage:size-80",
            "shadow-[0_32px_80px_-24px_oklch(0.58_0.12_15/0.35)] dark:shadow-[0_32px_90px_-30px_oklch(0_0_0/0.8)]",
          )}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={encodedKey}
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.4, ease: "easeOut" }}
              className="absolute inset-0"
            >
              {artworkUrl ? (
                <img
                  src={artworkUrl}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <div className="flex size-full items-center justify-center p-8">
                  <BrandRings className="w-3/4" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Vinyl groove overlay */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                "repeating-radial-gradient(circle at 50% 50%, rgba(255,255,255,0.03) 0 2px, transparent 2px 7px)",
              mixBlendMode: "overlay",
            }}
          />

          {/* Rotating concentric ring — nods to the home page Linked Loop */}
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-3 rounded-full border border-white/15 dark:border-white/10"
            animate={
              playing && !paused && !reduceMotion
                ? { rotate: 360 }
                : { rotate: 0 }
            }
            transition={
              playing && !paused && !reduceMotion
                ? { duration: 60, ease: "linear", repeat: Infinity }
                : { duration: 0 }
            }
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-10 rounded-full border border-white/10 dark:border-white/5"
          />

          {/* Inner glossy top highlight */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-1/3 rounded-t-2xl bg-linear-to-b from-white/10 to-transparent"
          />
        </div>

        {/* Breathing halo when paused with a current track */}
        {paused && current && !reduceMotion ? (
          <motion.span
            aria-hidden
            className="pointer-events-none absolute -inset-2 rounded-[1.75rem] bg-brand/20 blur-xl"
            initial={{ opacity: 0.55, scale: 1 }}
            animate={{ opacity: [0.55, 0.1, 0.55], scale: [1, 1.08, 1] }}
            transition={{ duration: 2.8, ease: "easeInOut", repeat: Infinity }}
          />
        ) : null}
      </motion.div>

      <motion.div
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.45,
          ease: [0.22, 1, 0.36, 1],
          delay: reduceMotion ? 0 : 0.08,
        }}
        className={cn(
          "mt-8 flex w-full max-w-xl flex-col gap-2",
          alignMeta,
        )}
      >
        <p className="eyebrow inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full align-middle",
              statusDotClass,
            )}
          />
          <span>{statusLabel}</span>
          <span className="text-muted-foreground/60">·</span>
          <span className="tabular-nums">Vol {volumePct}%</span>
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={encodedKey}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{
              duration: reduceMotion ? 0 : 0.35,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cn("flex flex-col gap-1", alignMeta)}
          >
            <h1 className="stage-display max-w-xl text-balance text-foreground">
              {current?.info.title ?? "Nothing playing"}
            </h1>
            <p className="max-w-md truncate text-base text-muted-foreground sm:text-lg">
              {current?.info.author ?? "Queue something to get started"}
            </p>
          </motion.div>
        </AnimatePresence>

        {requesterName ? (
          <div className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Avatar size="sm" className="size-5">
              {requesterAvatarUrl ? (
                <AvatarImage src={requesterAvatarUrl} alt="" />
              ) : null}
              <AvatarFallback className="text-[10px]">
                {requesterInitial(requesterName, current?.requesterId)}
              </AvatarFallback>
            </Avatar>
            <span>
              Added by{" "}
              <span className="text-foreground/80">{requesterName}</span>
            </span>
          </div>
        ) : null}
      </motion.div>
    </div>
  )
}
