import { motion, useReducedMotion } from "motion/react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth"

import {
  CONTROLLER_PREVIEW_PLAYER,
  ControllerProductSurface,
} from "./ControllerPage.js"

const features = [
  {
    n: "01",
    title: "One queue, for everyone.",
    body: "Everyone in the voice channel sees the same track playing and the same tracks coming up.",
  },
  {
    n: "02",
    title: "Built for the phone in your hand.",
    body: "Find a song, reorder the queue, skip, and pause without ever leaving your couch.",
  },
  {
    n: "03",
    title: "Less chat, more music.",
    body: "Steer the room from a clean surface instead of scrolling back through commands.",
  },
] as const

const highlights = [
  "Works in any browser",
  "Made for phones",
  "Shared with your voice channel",
  "Nothing to install",
] as const

export function HomePage() {
  const reduceMotion = useReducedMotion()
  const auth = useAuth()

  return (
    <div className="flex flex-col gap-20 lg:gap-28">
      <section>
        <motion.div
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{
            duration: reduceMotion ? 0 : 0.4,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="max-w-4xl"
        >
          <motion.p
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="eyebrow"
          >
            Loopify
          </motion.p>
          <motion.h1
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : 0.04 }}
            className="hero-display mt-6 text-balance text-foreground"
          >
            Queue anywhere. Play everywhere.
          </motion.h1>
          <motion.p
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : 0.08 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl"
          >
            A shared music room for your Discord voice channel. Pick tracks,
            hit play, and listen together — from a tab on any device.
          </motion.p>
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduceMotion ? 0 : 0.2, delay: reduceMotion ? 0 : 0.12 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            {auth.isLoading ? null : auth.isSignedIn ? (
              <Button asChild size="lg">
                <Link to="/controller">Open the room</Link>
              </Button>
            ) : (
              <Button asChild size="lg">
                <Link to="/login">Sign in with Discord</Link>
              </Button>
            )}
          </motion.div>
        </motion.div>
      </section>

      <section aria-label="Product preview">
        <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.35)] dark:shadow-[0_24px_80px_-32px_rgba(0,0,0,0.6)]">
          <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/50 px-4">
            <span
              className="size-2.5 rounded-full bg-[oklch(0.62_0.2_25)]"
              aria-hidden
            />
            <span
              className="size-2.5 rounded-full bg-[oklch(0.78_0.12_85)]"
              aria-hidden
            />
            <span
              className="size-2.5 rounded-full bg-[oklch(0.72_0.12_145)]"
              aria-hidden
            />
            <span className="ml-3 font-mono text-[0.65rem] text-muted-foreground">
              loopify.app / room
            </span>
          </div>
          <div className="max-h-[min(70vh,900px)] overflow-y-auto bg-background p-6 sm:p-10 lg:p-14">
            <ControllerProductSurface
              embedMode
              player={CONTROLLER_PREVIEW_PLAYER}
              onPauseToggle={() => {}}
              onSkip={() => {}}
              onStop={() => {}}
              onSeek={() => {}}
              onVolume={() => {}}
              onLoop={() => {}}
              onShuffle={() => {}}
              onClear={() => {}}
              search=""
              setSearch={() => {}}
              onSearch={() => {}}
              searchTracks={[]}
              searchPending={false}
              onAdd={() => {}}
              onMove={() => {}}
              onRemove={() => {}}
              queueBusy={false}
              transportPending={false}
            />
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-16 lg:gap-20">
        {features.map((row) => (
          <div
            key={row.n}
            className="grid gap-6 border-t border-border pt-16 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16 lg:pt-20"
          >
            <span className="font-mono text-5xl font-semibold tabular-nums text-muted-foreground/80 sm:text-6xl">
              {row.n}
            </span>
            <div className="max-w-3xl">
              <h2 className="section-display text-balance">{row.title}</h2>
              <p className="mt-4 max-w-prose text-base leading-relaxed text-muted-foreground sm:text-lg">
                {row.body}
              </p>
            </div>
          </div>
        ))}
      </section>

      <section className="border-t border-border pt-12">
        <div className="flex flex-wrap justify-center gap-x-0 gap-y-3 text-sm text-muted-foreground sm:justify-start">
          {highlights.map((item, i) => (
            <span key={item} className="flex items-center">
              {i > 0 ? (
                <span
                  className="mx-4 hidden h-3 w-px bg-border sm:inline"
                  aria-hidden
                />
              ) : null}
              <span>{item}</span>
            </span>
          ))}
        </div>
      </section>

      <section className="border-t border-border pt-12">
        <p className="eyebrow">Coming soon</p>
        <div className="mt-8 grid gap-10 md:grid-cols-2 md:gap-12">
          <div className="border-b border-border pb-10 md:border-b-0 md:border-r md:border-border md:pb-0 md:pr-12">
            <h3 className="text-lg font-semibold tracking-tight">Favorites</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Save the songs you keep coming back to, and bring them into the
              room in one tap.
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight">Playlists</h3>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              Build collections that slip right into the shared queue when
              you’re ready to press play.
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
