import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  PauseIcon,
  PlayIcon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipForwardIcon,
  SquareIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { LoopMode } from "@/lib/contracts"

function formatTime(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms < 0) {
    return "0:00"
  }
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const sec = String(total % 60).padStart(2, "0")
  return `${m}:${sec}`
}

const LOOP_ORDER: readonly LoopMode[] = ["off", "queue", "track"] as const

function loopLabel(mode: LoopMode): string {
  switch (mode) {
    case "track":
      return "Loop track"
    case "queue":
      return "Loop queue"
    default:
      return "Loop off"
  }
}

function useSmoothPosition(
  serverPosition: number,
  playing: boolean,
  paused: boolean,
): number {
  const [tickPos, setTickPos] = useState(serverPosition)
  const baseRef = useRef({ pos: serverPosition, t: performance.now() })

  useEffect(() => {
    baseRef.current = { pos: serverPosition, t: performance.now() }
    setTickPos(serverPosition)
  }, [serverPosition])

  useEffect(() => {
    if (!playing || paused) {
      return
    }
    let raf = 0
    const loop = () => {
      const { pos, t } = baseRef.current
      setTickPos(pos + (performance.now() - t))
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, paused])

  return tickPos
}

export type TransportDeckProps = {
  position: number
  duration: number
  playing: boolean
  paused: boolean
  hasCurrent: boolean
  volume: number
  repeatMode: LoopMode
  queueLength: number
  transportPending: boolean
  queueBusy: boolean
  onPauseToggle: () => void
  onSkip: () => void
  onStop: () => void
  onSeek: (positionMs: number) => void
  onVolume: (v: number) => void
  onLoop: (mode: LoopMode) => void
  onShuffle: () => void
}

export function TransportDeck(props: TransportDeckProps) {
  const reduceMotion = useReducedMotion()

  const [scrubPos, setScrubPos] = useState<number | null>(null)
  const tickPos = useSmoothPosition(props.position, props.playing, props.paused)
  const displayPos = scrubPos ?? tickPos
  const safeDuration = Math.max(props.duration, 1)
  const progressPct = Math.min(100, (displayPos / safeDuration) * 100)
  const remainingMs = Math.max(0, (props.duration || 0) - displayPos)
  const shimmerActive = props.playing && !props.paused && props.duration > 0

  const [localVolume, setLocalVolume] = useState<number | null>(null)
  const volumeValue = localVolume ?? props.volume
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset local override whenever the server-confirmed volume changes
  useEffect(() => {
    setLocalVolume(null)
  }, [props.volume])

  const lastNonZeroVolume = useRef<number>(props.volume > 0 ? props.volume : 500)
  useEffect(() => {
    if (props.volume > 0) {
      lastNonZeroVolume.current = props.volume
    }
  }, [props.volume])

  const volumePctRounded = Math.round(volumeValue / 10)
  const isMuted = volumeValue <= 0

  const handleMuteToggle = () => {
    if (isMuted) {
      const restore = lastNonZeroVolume.current || 500
      setLocalVolume(restore)
      props.onVolume(restore)
    } else {
      lastNonZeroVolume.current = volumeValue
      setLocalVolume(0)
      props.onVolume(0)
    }
  }

  const loopActive = props.repeatMode !== "off"
  const nextLoop =
    LOOP_ORDER[(LOOP_ORDER.indexOf(props.repeatMode) + 1) % LOOP_ORDER.length] ??
    "off"
  const LoopGlyph = props.repeatMode === "track" ? Repeat1Icon : RepeatIcon

  const VolumeGlyph =
    volumeValue <= 0 ? VolumeXIcon : volumeValue < 400 ? Volume1Icon : Volume2Icon

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: reduceMotion ? 0 : 0.45,
        ease: [0.22, 1, 0.36, 1],
        delay: reduceMotion ? 0 : 0.14,
      }}
      className="flex flex-col gap-6"
    >
      {/* Seek bar */}
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Slider
            value={[Math.min(displayPos, props.duration || 0)]}
            min={0}
            max={safeDuration}
            step={1000}
            disabled={!props.hasCurrent || props.duration <= 0}
            aria-label="Seek position"
            onValueChange={(values) => {
              const next = values[0]
              if (typeof next === "number") {
                setScrubPos(next)
              }
            }}
            onValueCommit={(values) => {
              const next = values[0]
              setScrubPos(null)
              if (typeof next === "number") {
                props.onSeek(next)
              }
            }}
            className="**:data-[slot=slider-range]:bg-linear-to-r **:data-[slot=slider-range]:from-brand **:data-[slot=slider-range]:to-brand/60 **:data-[slot=slider-track]:h-1.5 **:data-[slot=slider-thumb]:size-3.5 **:data-[slot=slider-thumb]:border-brand/40 **:data-[slot=slider-thumb]:bg-brand"
          />
          {shimmerActive && !reduceMotion ? (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
              style={{
                clipPath: `inset(0 ${Math.max(0, 100 - progressPct)}% 0 0)`,
              }}
            >
              <motion.span
                className="absolute top-1/2 left-0 h-1.5 w-[30%] min-w-14 -translate-y-1/2 rounded-full bg-linear-to-r from-transparent via-white/70 to-transparent mix-blend-overlay"
                initial={{ x: "-120%" }}
                animate={{ x: "320%" }}
                transition={{
                  duration: 2.2,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatDelay: 0.35,
                }}
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center justify-between font-mono text-xs tabular-nums text-muted-foreground">
          <span>{formatTime(displayPos)}</span>
          <span className="flex items-center gap-2">
            <span>{formatTime(props.duration)}</span>
            {props.hasCurrent && props.duration > 0 ? (
              <>
                <span className="text-muted-foreground/50">·</span>
                <span className="text-muted-foreground/80">
                  -{formatTime(remainingMs)}
                </span>
              </>
            ) : null}
          </span>
        </div>
      </div>

      {/* Deck row: shuffle/loop | transport | volume */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {/* Left cluster */}
        <div className="flex items-center gap-2 justify-self-start">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={props.onShuffle}
                disabled={props.queueLength < 2 || props.queueBusy}
                aria-label="Shuffle queue"
                className="size-10 rounded-full"
              >
                <ShuffleIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Shuffle</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                onClick={() => props.onLoop(nextLoop)}
                aria-busy={props.transportPending}
                aria-pressed={loopActive}
                aria-label={loopLabel(props.repeatMode)}
                className={cn(
                  "size-10 rounded-full transition-opacity",
                  loopActive && "text-brand hover:text-brand",
                  props.transportPending && "opacity-80",
                )}
              >
                <LoopGlyph />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{loopLabel(props.repeatMode)}</TooltipContent>
          </Tooltip>
        </div>

        {/* Center transport */}
        <div className="flex items-center gap-4 sm:gap-5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={props.onStop}
                disabled={!props.hasCurrent}
                aria-busy={props.transportPending}
                aria-label="Stop"
                className={cn(
                  "size-11 rounded-full transition-opacity",
                  props.transportPending && "opacity-80",
                )}
              >
                <SquareIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Stop</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                onClick={props.onPauseToggle}
                aria-busy={props.transportPending}
                aria-label={props.paused ? "Play" : "Pause"}
                className={cn(
                  "relative size-16 rounded-full bg-brand text-brand-foreground shadow-[0_14px_40px_-14px_oklch(0.58_0.12_15/0.7)] transition-opacity hover:bg-brand/90 sm:size-18",
                  props.transportPending && "opacity-90",
                )}
              >
                {props.paused && props.hasCurrent && !reduceMotion ? (
                  <motion.span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 rounded-full bg-brand/40"
                    initial={{ opacity: 0.55, scale: 1 }}
                    animate={{ opacity: [0.55, 0, 0.55], scale: [1, 1.35, 1] }}
                    transition={{
                      duration: 2.4,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                  />
                ) : null}
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={props.paused ? "play" : "pause"}
                    initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.7 }}
                    transition={{ duration: reduceMotion ? 0 : 0.18 }}
                    className="relative z-10 flex items-center justify-center"
                  >
                    {props.paused ? (
                      <PlayIcon className="size-7 translate-x-0.5" />
                    ) : (
                      <PauseIcon className="size-7" />
                    )}
                  </motion.span>
                </AnimatePresence>
              </Button>
            </TooltipTrigger>
            <TooltipContent>{props.paused ? "Play" : "Pause"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={props.onSkip}
                disabled={!props.hasCurrent}
                aria-busy={props.transportPending}
                aria-label="Skip to next"
                className={cn(
                  "size-11 rounded-full transition-opacity",
                  props.transportPending && "opacity-80",
                )}
              >
                <SkipForwardIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Skip</TooltipContent>
          </Tooltip>
        </div>

        {/* Right cluster: volume */}
        <div className="flex items-center gap-1 justify-self-end">
          <Popover>
            <Tooltip>
              <TooltipTrigger asChild>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={isMuted ? "Unmute" : `Volume ${volumePctRounded}%`}
                    className="size-10 rounded-full"
                  >
                    <VolumeGlyph />
                  </Button>
                </PopoverTrigger>
              </TooltipTrigger>
              <TooltipContent>
                {isMuted ? "Unmute" : `Volume ${volumePctRounded}%`}
              </TooltipContent>
            </Tooltip>
            <PopoverContent align="end" className="w-60">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="eyebrow">Volume</p>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {volumePctRounded}%
                  </span>
                </div>
                <Slider
                  value={[volumeValue]}
                  min={0}
                  max={1000}
                  step={10}
                  aria-label="Volume"
                  onValueChange={(values) => {
                    const next = values[0]
                    if (typeof next === "number") {
                      setLocalVolume(next)
                    }
                  }}
                  onValueCommit={(values) => {
                    const next = values[0]
                    if (typeof next === "number") {
                      props.onVolume(next)
                    }
                  }}
                  className="**:data-[slot=slider-range]:bg-foreground"
                />
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={handleMuteToggle}
                  >
                    {isMuted ? "Unmute" : "Mute"}
                  </Button>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        const next = Math.max(0, volumeValue - 100)
                        setLocalVolume(next)
                        props.onVolume(next)
                      }}
                    >
                      -10%
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      onClick={() => {
                        const next = Math.min(1000, volumeValue + 100)
                        setLocalVolume(next)
                        props.onVolume(next)
                      }}
                    >
                      +10%
                    </Button>
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </motion.div>
  )
}
