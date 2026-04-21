import type { LoopMode, PlayerSnapshot, QueueItem } from "@loopify/protocol"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import {
  AlertCircleIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  EraserIcon,
  Music2Icon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Repeat1Icon,
  RepeatIcon,
  SearchIcon,
  ShuffleIcon,
  SkipForwardIcon,
  SquareIcon,
  Trash2Icon,
  Volume1Icon,
  Volume2Icon,
  VolumeXIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { apiFetch, fetchController } from "../lib/api.js"

type SearchTrack = {
  encoded?: string
  info: { title?: string; author?: string; uri?: string }
}

function formatTime(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms) || ms < 0) {
    return "0:00"
  }
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const sec = String(total % 60).padStart(2, "0")
  return `${m}:${sec}`
}

function trackKey(t: QueueItem, fallback: string): string {
  return (
    t.encoded ??
    t.info.identifier ??
    t.info.uri ??
    `${t.info.title ?? "t"}-${t.info.author ?? ""}-${fallback}`
  )
}

function formatActionError(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message.trim()
    return m.length > 220 ? `${m.slice(0, 220)}…` : m
  }
  return "Something went wrong."
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

function SecondaryTransportButton(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.label}
      className="group flex flex-col items-center gap-2 disabled:opacity-40"
    >
      <span className="flex size-12 items-center justify-center rounded-full border border-border bg-background text-foreground transition-colors group-enabled:group-hover:bg-muted group-enabled:group-active:translate-y-px">
        <props.icon className="size-5" />
      </span>
      <span className="font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
        {props.label}
      </span>
    </button>
  )
}

function PrimaryTransportButton(props: {
  paused: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label={props.paused ? "Play" : "Pause"}
      className="group flex flex-col items-center gap-2 disabled:opacity-40"
    >
      <span className="flex size-16 items-center justify-center rounded-full bg-brand text-brand-foreground shadow-[0_10px_30px_-12px_oklch(0.58_0.12_15/0.6)] transition-transform group-enabled:group-hover:bg-brand/90 group-enabled:group-active:translate-y-px">
        {props.paused ? (
          <PlayIcon className="size-7 translate-x-0.5" />
        ) : (
          <PauseIcon className="size-7" />
        )}
      </span>
      <span className="font-mono text-[0.65rem] font-medium tracking-wide text-foreground uppercase">
        {props.paused ? "Play" : "Pause"}
      </span>
    </button>
  )
}

function ShuffleToggle(props: { onClick: () => void; disabled?: boolean }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={props.onClick}
      disabled={props.disabled}
      aria-label="Shuffle queue"
    >
      <ShuffleIcon data-icon="inline-start" />
      Shuffle
    </Button>
  )
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

function LoopToggle(props: {
  mode: LoopMode
  onChange: (mode: LoopMode) => void
  disabled?: boolean
}) {
  const next =
    LOOP_ORDER[(LOOP_ORDER.indexOf(props.mode) + 1) % LOOP_ORDER.length] ??
    "off"
  const active = props.mode !== "off"
  const Icon = props.mode === "track" ? Repeat1Icon : RepeatIcon
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={() => props.onChange(next)}
      disabled={props.disabled}
      aria-pressed={active}
      aria-label={loopLabel(props.mode)}
      className={cn(active && "text-brand")}
    >
      <Icon data-icon="inline-start" />
      {loopLabel(props.mode)}
    </Button>
  )
}

function VolumeIcon(props: { volume: number }) {
  const Icon =
    props.volume <= 0 ? VolumeXIcon : props.volume < 400 ? Volume1Icon : Volume2Icon
  return <Icon className="size-4 shrink-0 text-muted-foreground" />
}

function TransportRow(props: {
  paused: boolean
  hasCurrent: boolean
  transportPending: boolean
  onPauseToggle: () => void
  onSkip: () => void
  onStop: () => void
}) {
  return (
    <div className="flex items-start justify-center gap-6 sm:gap-10">
      <SecondaryTransportButton
        icon={SkipForwardIcon}
        label="Skip"
        onClick={props.onSkip}
        disabled={!props.hasCurrent || props.transportPending}
      />
      <PrimaryTransportButton
        paused={props.paused}
        onClick={props.onPauseToggle}
        disabled={props.transportPending}
      />
      <SecondaryTransportButton
        icon={SquareIcon}
        label="Stop"
        onClick={props.onStop}
        disabled={!props.hasCurrent || props.transportPending}
      />
    </div>
  )
}

export function ControllerPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState("")
  const [actionError, setActionError] = useState<string | null>(null)
  const [movePending, setMovePending] = useState(false)

  const meQ = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const r = await apiFetch("/api/me")
      if (!r.ok) {
        throw new Error("me")
      }
      return r.json() as Promise<{ userId: string }>
    },
    retry: false,
  })

  const controllerQ = useQuery({
    queryKey: ["controller"],
    queryFn: fetchController,
    retry: false,
    refetchInterval: (q) => (q.state.error ? false : 15_000),
    refetchOnWindowFocus: (q) => !q.state.error,
  })

  const wsConnected = controllerQ.isSuccess
  useEffect(() => {
    if (!wsConnected) {
      return
    }
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:"
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`)
    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as { type: string }
        if (data.type === "serverEvent") {
          qc.invalidateQueries({ queryKey: ["controller"] })
        }
      } catch {
        /* ignore */
      }
    }
    return () => ws.close()
  }, [qc, wsConnected])

  const player = controllerQ.data?.player
  const guildId = player?.guildId ?? ""

  const pauseMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/pause`,
        { method: "POST", body: "{}" },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const skipMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/skip`,
        { method: "POST", body: "{}" },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const stopMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/stop`,
        { method: "POST", body: "{}" },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const seekMut = useMutation({
    mutationFn: async (positionMs: number) => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/seek`,
        { method: "POST", body: JSON.stringify({ positionMs }) },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const volumeMut = useMutation({
    mutationFn: async (volume: number) => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/volume`,
        { method: "POST", body: JSON.stringify({ volume }) },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const loopMut = useMutation({
    mutationFn: async (mode: LoopMode) => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/loop`,
        { method: "POST", body: JSON.stringify({ mode }) },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const shuffleMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/shuffle`,
        { method: "POST", body: "{}" },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const clearMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/clear`,
        { method: "POST", body: "{}" },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const searchMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/search?query=${encodeURIComponent(search)}`)
      if (!r.ok) throw new Error(await r.text())
      return r.json() as Promise<{ tracks?: SearchTrack[] }>
    },
    onSuccess: () => setActionError(null),
    onError: (e) => setActionError(formatActionError(e)),
  })

  const addMut = useMutation({
    mutationFn: async (encoded: string) => {
      const uid = meQ.data?.userId
      if (!uid) throw new Error("Not signed in")
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/queue`,
        {
          method: "POST",
          body: JSON.stringify({ encoded, requesterId: uid }),
        },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
      setSearch("")
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  const removeMut = useMutation({
    mutationFn: async (index: number) => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/queue/${index}`,
        { method: "DELETE" },
      )
      if (!r.ok) throw new Error(await r.text())
    },
    onSuccess: () => {
      setActionError(null)
      qc.invalidateQueries({ queryKey: ["controller"] })
    },
    onError: (e) => setActionError(formatActionError(e)),
  })

  async function moveQueue(from: number, to: number) {
    if (from === to) return
    setMovePending(true)
    setActionError(null)
    try {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/queue/move`,
        { method: "POST", body: JSON.stringify({ from, to }) },
      )
      if (!r.ok) {
        setActionError(formatActionError(new Error(await r.text())))
        return
      }
      qc.invalidateQueries({ queryKey: ["controller"] })
    } catch (e) {
      setActionError(formatActionError(e))
    } finally {
      setMovePending(false)
    }
  }

  const queueBusy =
    removeMut.isPending ||
    movePending ||
    shuffleMut.isPending ||
    clearMut.isPending
  const transportPending =
    pauseMut.isPending ||
    skipMut.isPending ||
    stopMut.isPending ||
    seekMut.isPending ||
    loopMut.isPending

  const demoActive =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).has("demo")

  if (demoActive) {
    return (
      <ControllerProductSurface
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
    )
  }

  if (controllerQ.isError) {
    return (
      <GateState
        title="Sign in to enter the room."
        description="The room needs to know who you are before you can control playback."
        primary={{ to: "/login", label: "Continue with Discord" }}
      />
    )
  }

  if (controllerQ.isPending) {
    return <ControllerSkeleton />
  }

  if (!player) {
    return (
      <GateState
        title="Join a voice channel first."
        description="Hop into the same voice channel as Loopify, then come back here."
        primary={{ to: "/", label: "Back home" }}
      />
    )
  }

  return (
    <ControllerProductSurface
      player={player}
      onPauseToggle={() => pauseMut.mutate()}
      onSkip={() => skipMut.mutate()}
      onStop={() => stopMut.mutate()}
      onSeek={(ms) => seekMut.mutate(ms)}
      onVolume={(v) => volumeMut.mutate(v)}
      onLoop={(mode) => loopMut.mutate(mode)}
      onShuffle={() => shuffleMut.mutate()}
      onClear={() => clearMut.mutate()}
      search={search}
      setSearch={setSearch}
      onSearch={() => searchMut.mutate()}
      searchTracks={searchMut.data?.tracks ?? []}
      searchPending={searchMut.isPending}
      onAdd={(enc) => addMut.mutate(enc)}
      onMove={moveQueue}
      onRemove={(index) => removeMut.mutate(index)}
      queueBusy={queueBusy}
      actionError={actionError}
      onDismissError={() => setActionError(null)}
      transportPending={transportPending}
    />
  )
}

export function ControllerProductSurface(props: {
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
}) {
  const { player: p } = props
  const reduceMotion = useReducedMotion()
  const [panel, setPanel] = useState<"queue" | "search">("queue")

  const searchPending = props.searchPending ?? false
  const queueBusy = props.queueBusy ?? false
  const actionError = props.actionError ?? null
  const transportPending = props.transportPending ?? false
  const current = p.current
  const queue = p.queue ?? []
  const duration = current?.info.duration ?? 0
  const tickPos = useSmoothPosition(p.position, p.playing, p.paused)
  const volPct = Math.round(p.volume / 10)

  const [scrubPos, setScrubPos] = useState<number | null>(null)
  const displayPos = scrubPos ?? tickPos

  const [localVolume, setLocalVolume] = useState<number | null>(null)
  const volumeValue = localVolume ?? p.volume
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset local override whenever the server-confirmed volume changes
  useEffect(() => {
    setLocalVolume(null)
  }, [p.volume])

  useEffect(() => {
    if (props.searchTracks.length > 0) {
      setPanel("search")
    }
  }, [props.searchTracks.length])

  const statusLabel = p.paused
    ? "Paused"
    : current
      ? "Playing"
      : "Idle"

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={reduceMotion ? undefined : { opacity: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mx-auto w-full max-w-2xl"
    >
      <AnimatePresence initial={false}>
        {actionError ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={reduceMotion ? undefined : { opacity: 1 }}
            exit={reduceMotion ? undefined : { opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="mb-6"
          >
            <Alert variant="destructive">
              <AlertCircleIcon />
              <AlertTitle>Couldn’t update the room</AlertTitle>
              <AlertDescription>{actionError}</AlertDescription>
              <AlertAction>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  onClick={() => props.onDismissError?.()}
                >
                  Dismiss
                </Button>
              </AlertAction>
            </Alert>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <section className="flex flex-col items-center text-center">
        <div className="relative size-40 overflow-hidden rounded-xl border border-border bg-muted/40 sm:size-44">
          {current?.info.artworkUrl ? (
            <img
              src={current.info.artworkUrl}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              <Music2Icon className="size-10" />
            </div>
          )}
        </div>

        <h1 className="mt-8 max-w-lg truncate text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {current?.info.title ?? "Nothing playing"}
        </h1>
        <p className="mt-1 max-w-md truncate text-sm text-muted-foreground sm:text-base">
          {current?.info.author ?? "Add a track to get started"}
        </p>

        <p className="mt-4 font-mono text-[0.65rem] tracking-wide text-muted-foreground uppercase">
          <span
            className={cn(
              "inline-block size-1.5 rounded-full align-middle",
              p.paused
                ? "bg-muted-foreground"
                : current
                  ? "bg-brand"
                  : "bg-muted-foreground",
            )}
          />
          <span className="ml-2 align-middle">{statusLabel}</span>
          <span className="mx-2 align-middle text-muted-foreground/60">·</span>
          <span className="align-middle">Volume {volPct}%</span>
        </p>
      </section>

      <section className="mt-8">
        <Slider
          value={[Math.min(displayPos, duration || 0)]}
          min={0}
          max={Math.max(duration, 1)}
          step={1000}
          disabled={!current || duration <= 0}
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
        />
        <div className="mt-2 flex items-center justify-between font-mono text-xs text-muted-foreground">
          <span>{formatTime(displayPos)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </section>

      <section className="mt-10">
        <TransportRow
          paused={p.paused}
          hasCurrent={Boolean(current)}
          transportPending={transportPending}
          onPauseToggle={props.onPauseToggle}
          onSkip={props.onSkip}
          onStop={props.onStop}
        />
      </section>

      <section className="mt-8 flex items-center justify-center gap-3">
        <ShuffleToggle
          onClick={props.onShuffle}
          disabled={queue.length < 2 || queueBusy}
        />
        <LoopToggle
          mode={p.repeatMode}
          onChange={props.onLoop}
          disabled={transportPending}
        />
      </section>

      <section className="mt-8">
        <div className="flex items-center gap-3">
          <VolumeIcon volume={volumeValue} />
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
            className="flex-1"
          />
          <span className="w-10 shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
            {Math.round(volumeValue / 10)}%
          </span>
        </div>
      </section>

      <section className="mt-14 border-t border-border pt-10">
        <Tabs
          value={panel}
          onValueChange={(value) => setPanel(value as "queue" | "search")}
          className="flex flex-col gap-0"
        >
          <TabsList className="h-9 w-full justify-start rounded-none border-b border-border bg-transparent p-0">
            <TabsTrigger
              value="queue"
              className="rounded-none border-0 border-b-2 border-transparent px-0 pb-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Up next
              {queue.length > 0 ? (
                <span className="ml-2 font-mono text-xs text-muted-foreground">
                  {queue.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger
              value="search"
              className="ml-6 rounded-none border-0 border-b-2 border-transparent px-0 pb-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Add a track
            </TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="mt-6 data-[state=inactive]:hidden">
            {queue.length === 0 ? (
              <div className="border border-dashed border-border px-4 py-12 text-center">
                <p className="text-sm font-medium text-foreground">
                  The queue is empty.
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Switch to “Add a track” to find something to play.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-end">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    onClick={props.onClear}
                    disabled={queueBusy}
                  >
                    <EraserIcon data-icon="inline-start" />
                    Clear queue
                  </Button>
                </div>
                <div className="divide-y divide-border border border-border">
                {queue.map((track, index) => (
                  <TrackRow
                    key={trackKey(track, String(index))}
                    title={track.info.title ?? "Untitled"}
                    subtitle={track.info.author ?? ""}
                    indexLabel={String(index + 1).padStart(2, "0")}
                    durationMs={track.info.duration}
                    actions={
                      <>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={index === 0 || queueBusy}
                          onClick={() => props.onMove(index, index - 1)}
                          aria-label="Move up"
                        >
                          <ArrowUpIcon />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={index >= queue.length - 1 || queueBusy}
                          onClick={() => props.onMove(index, index + 1)}
                          aria-label="Move down"
                        >
                          <ArrowDownIcon />
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          disabled={queueBusy}
                          onClick={() => props.onRemove(index)}
                          aria-label="Remove"
                        >
                          <Trash2Icon />
                        </Button>
                      </>
                    }
                  />
                ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="search" className="mt-6 data-[state=inactive]:hidden">
            <form
              className="flex flex-col gap-3 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                if (!props.search.trim() || searchPending) {
                  return
                }
                props.onSearch()
              }}
            >
              <Input
                value={props.search}
                onChange={(event) => props.setSearch(event.target.value)}
                placeholder="Song name, artist, or a link"
                aria-label="Find a track"
                className="rounded-md"
              />
              <Button
                type="submit"
                disabled={!props.search.trim() || searchPending}
                className="shrink-0"
              >
                <SearchIcon data-icon="inline-start" />
                {searchPending ? "Searching…" : "Search"}
              </Button>
            </form>

            <div className="mt-4">
              {props.searchTracks.length > 0 ? (
                <div className="divide-y divide-border border border-border">
                  {props.searchTracks.slice(0, 8).map((track, index) => (
                    <TrackRow
                      key={track.encoded ?? `result-${String(index)}`}
                      title={track.info.title ?? "Untitled"}
                      subtitle={track.info.author ?? ""}
                      indexLabel={String(index + 1).padStart(2, "0")}
                      actions={
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            track.encoded && props.onAdd(track.encoded)
                          }
                          disabled={!track.encoded}
                        >
                          <PlusIcon data-icon="inline-start" />
                          Add
                        </Button>
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="border border-dashed border-border px-4 py-12 text-center text-sm text-muted-foreground">
                  Find a song by name, or paste a link.
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </motion.div>
  )
}

function GateState(props: {
  title: string
  description: string
  primary: { to: string; label: string }
  secondary?: { to: string; label: string }
}) {
  return (
    <div className="mx-auto max-w-xl text-center">
      <h1 className="section-display text-balance">{props.title}</h1>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
        {props.description}
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg">
          <Link to={props.primary.to}>{props.primary.label}</Link>
        </Button>
        {props.secondary ? (
          <Button asChild size="lg" variant="outline">
            <Link to={props.secondary.to}>{props.secondary.label}</Link>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function TrackRow(props: {
  title: string
  subtitle: string
  indexLabel: string
  durationMs?: number
  actions: React.ReactNode
}) {
  const fallback = props.title.slice(0, 1).toUpperCase()

  return (
    <div className="group flex items-center gap-3 border-l-2 border-l-transparent bg-background py-3 pr-2 pl-3 transition-colors hover:border-l-brand">
      <span className="w-7 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
        {props.indexLabel}
      </span>
      <Avatar size="default" className="size-9 shrink-0">
        <AvatarFallback className="text-xs">{fallback}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium text-foreground">
          {props.title}
        </p>
        {props.subtitle ? (
          <p className="truncate text-xs text-muted-foreground">
            {props.subtitle}
          </p>
        ) : null}
      </div>
      {props.durationMs != null ? (
        <span className="hidden shrink-0 font-mono text-xs text-muted-foreground sm:inline">
          {formatTime(props.durationMs)}
        </span>
      ) : null}
      <div className="flex shrink-0 items-center gap-0.5">{props.actions}</div>
    </div>
  )
}

function ControllerSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center">
      <Skeleton className="size-40 rounded-xl sm:size-44" />
      <Skeleton className="mt-8 h-8 w-2/3 max-w-sm" />
      <Skeleton className="mt-2 h-4 w-1/2 max-w-xs" />
      <Skeleton className="mt-8 h-1 w-full" />
      <div className="mt-10 flex gap-10">
        <Skeleton className="size-12 rounded-full" />
        <Skeleton className="size-16 rounded-full" />
        <Skeleton className="size-12 rounded-full" />
      </div>
      <Skeleton className="mt-14 h-9 w-full" />
      <Skeleton className="mt-6 h-20 w-full" />
      <Skeleton className="mt-2 h-20 w-full" />
    </div>
  )
}

export const CONTROLLER_PREVIEW_PLAYER: PlayerSnapshot = {
  guildId: "982718273645182939",
  voiceChannelId: "982718273645182944",
  textChannelId: "982718273645182941",
  position: 78_000,
  paused: false,
  playing: true,
  volume: 640,
  repeatMode: "queue",
  current: {
    encoded: "demo-current",
    requesterId: "129348572398475823",
    info: {
      title: "Mariners Apartment Complex",
      author: "Lana Del Rey",
      duration: 285_000,
      uri: "https://music.example/track/1",
      identifier: "demo-1",
      artworkUrl: "https://picsum.photos/seed/loopify-demo/800/800",
    },
  },
  queue: [
    {
      encoded: "d2",
      requesterId: "x",
      info: {
        title: "Venice Bitch",
        author: "Lana Del Rey",
        duration: 583_000,
      },
    },
    {
      encoded: "d3",
      requesterId: "x",
      info: {
        title: "Cinnamon Girl",
        author: "Lana Del Rey",
        duration: 296_000,
      },
    },
    {
      encoded: "d4",
      requesterId: "x",
      info: {
        title: "How to disappear",
        author: "Lana Del Rey",
        duration: 206_000,
      },
    },
    {
      encoded: "d5",
      requesterId: "x",
      info: { title: "California", author: "Lana Del Rey", duration: 271_000 },
    },
    {
      encoded: "d6",
      requesterId: "x",
      info: {
        title: "The Greatest",
        author: "Lana Del Rey",
        duration: 280_000,
      },
    },
  ],
  ping: { ws: 48, lavalink: 22 },
}
