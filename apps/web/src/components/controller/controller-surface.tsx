import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { AlertCircleIcon } from "lucide-react"
import { useEffect } from "react"

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { LoopMode, PlayerSnapshot } from "@/lib/contracts"

import { AmbientArtBackdrop } from "./ambient-art-backdrop"
import { NowPlayingHero } from "./now-playing-hero"
import { QueueRail } from "./queue-rail"
import { TransportDeck } from "./transport-deck"

type SearchTrack = {
  encoded?: string
  info: { title?: string; author?: string; uri?: string; artworkUrl?: string }
}

export type ControllerProductSurfaceProps = {
  player: PlayerSnapshot
  onPauseToggle: () => void
  onSkip: () => void
  onStop: () => void
  onSeek: (positionMs: number) => void
  onVolume: (volume: number) => void
  onLoop: (mode: LoopMode) => void
  onShuffle: () => void
  onClear: () => void
  search: string
  setSearch: (v: string) => void
  onSearch: () => void
  searchTracks: SearchTrack[]
  searchPending?: boolean
  onAdd: (enc: string) => void
  onMove: (from: number, to: number) => void
  onRemove: (index: number) => void
  queueBusy?: boolean
  actionError?: string | null
  onDismissError?: () => void
  transportPending?: boolean
  /** When true, disables the page-level wrapper (for embedding). */
  embedMode?: boolean
}

export function ControllerProductSurface(props: ControllerProductSurfaceProps) {
  const { player: p } = props
  const reduceMotion = useReducedMotion()

  const searchPending = props.searchPending ?? false
  const queueBusy = props.queueBusy ?? false
  const actionError = props.actionError ?? null
  const transportPending = props.transportPending ?? false
  const current = p.current
  const queue = p.queue ?? []
  const duration = current?.info.duration ?? 0
  const volPct = Math.round(p.volume / 10)
  const encodedKey =
    current?.encoded ?? current?.info.identifier ?? "controller-idle"

  // Auto-dismiss errors after 6s.
  useEffect(() => {
    if (!actionError || !props.onDismissError) {
      return
    }
    const dismiss = props.onDismissError
    const id = window.setTimeout(() => dismiss(), 6000)
    return () => window.clearTimeout(id)
  }, [actionError, props.onDismissError])

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "@container/surface relative isolate mx-auto w-full",
        props.embedMode ? "max-w-2xl" : "max-w-6xl",
      )}
    >
      <AmbientArtBackdrop
        artworkUrl={current?.info.artworkUrl}
        encodedKey={encodedKey}
        disabled={props.embedMode}
      />

      {!props.embedMode ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-20 bg-noise opacity-[0.04] dark:opacity-[0.06]"
        />
      ) : null}

      {/* Inline error on mobile (sits above the hero) */}
      <AnimatePresence initial={false}>
        {actionError ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="mb-6 md:hidden"
          >
            <ErrorAlert
              message={actionError}
              onDismiss={props.onDismissError}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div
        className={cn(
          "grid gap-10",
          props.embedMode
            ? "grid-cols-1"
            : "grid-cols-1 @5xl/surface:grid-cols-[minmax(0,1fr)_22rem] @5xl/surface:gap-12",
        )}
      >
        {/* Stage */}
        <div className="@container/stage flex min-w-0 flex-col gap-10">
          <NowPlayingHero
            current={current}
            playing={p.playing}
            paused={p.paused}
            volumePct={volPct}
            forceCentered={props.embedMode}
          />
          <TransportDeck
            position={p.position}
            duration={duration}
            playing={p.playing}
            paused={p.paused}
            hasCurrent={Boolean(current)}
            volume={p.volume}
            repeatMode={p.repeatMode}
            queueLength={queue.length}
            transportPending={transportPending}
            queueBusy={queueBusy}
            onPauseToggle={props.onPauseToggle}
            onSkip={props.onSkip}
            onStop={props.onStop}
            onSeek={props.onSeek}
            onVolume={props.onVolume}
            onLoop={props.onLoop}
            onShuffle={props.onShuffle}
          />
        </div>

        {/* Rail */}
        <div
          className={cn(
            "min-w-0",
            !props.embedMode &&
              "@5xl/surface:sticky @5xl/surface:top-24 @5xl/surface:self-start",
          )}
        >
          {props.embedMode ? (
            <div className="mt-2 border-t border-border pt-8" aria-hidden />
          ) : null}
          <QueueRail
            current={current}
            queue={queue}
            search={props.search}
            setSearch={props.setSearch}
            onSearch={props.onSearch}
            searchTracks={props.searchTracks}
            searchPending={searchPending}
            onAdd={props.onAdd}
            onMove={props.onMove}
            onRemove={props.onRemove}
            onClear={props.onClear}
            queueBusy={queueBusy}
          />
        </div>
      </div>

      {/* Floating toast on md+ */}
      <AnimatePresence initial={false}>
        {actionError ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="pointer-events-none fixed right-6 bottom-6 z-50 hidden w-full max-w-sm md:block"
          >
            <div className="pointer-events-auto">
              <ErrorAlert
                message={actionError}
                onDismiss={props.onDismissError}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.div>
  )
}

function ErrorAlert({
  message,
  onDismiss,
}: {
  message: string
  onDismiss?: () => void
}) {
  return (
    <Alert variant="destructive" className="shadow-[0_24px_60px_-24px_rgba(0,0,0,0.4)]">
      <AlertCircleIcon />
      <AlertTitle>Couldn’t update the room</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onDismiss ? (
        <AlertAction>
          <Button type="button" size="xs" variant="ghost" onClick={onDismiss}>
            Dismiss
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  )
}
