import type {
  LoopMode,
  PlayerSnapshot,
  QueueItem,
  ServerEvent,
  SseEnvelope,
} from "@/lib/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { QueryClient } from "@tanstack/react-query"
import { ArrowRightIcon } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { PageGate } from "@/components/page-gate"
import { ControllerProductSurface } from "@/components/controller/controller-surface"
import { Skeleton } from "@/components/ui/skeleton"

import { apiFetch, fetchController } from "../lib/api.js"

type ControllerData = { player: PlayerSnapshot | null }
type MutationContext = { previous?: ControllerData }
const CONTROLLER_KEY = ["controller"] as const

function patchCachedPlayer(
  qc: QueryClient,
  updater: (player: PlayerSnapshot) => PlayerSnapshot,
): ControllerData | undefined {
  const prev = qc.getQueryData<ControllerData>(CONTROLLER_KEY)
  if (prev?.player) {
    qc.setQueryData<ControllerData>(CONTROLLER_KEY, {
      player: updater(prev.player),
    })
  }
  return prev
}

function writeCachedController(
  qc: QueryClient,
  next: ControllerData | undefined,
) {
  if (next === undefined) {
    return
  }
  qc.setQueryData<ControllerData>(CONTROLLER_KEY, next)
}

function applyServerEvent(qc: QueryClient, event: ServerEvent) {
  switch (event.type) {
    case "trackStart": {
      qc.setQueryData<ControllerData>(CONTROLLER_KEY, {
        player: event.snapshot,
      })
      return
    }
    case "playerUpdate": {
      const snapshot = event.snapshot
      if (!snapshot) {
        return
      }
      patchCachedPlayer(qc, (player) => ({ ...player, ...snapshot }))
      return
    }
    case "queueChange": {
      const current = qc.getQueryData<ControllerData>(CONTROLLER_KEY)?.player
      if (!current) {
        return
      }
      const expected = current.queue.length + (current.current ? 1 : 0)
      if (expected !== event.length) {
        // Lengths diverged - the next playerUpdate will carry authoritative data,
        // but fall back to a refetch to stay consistent.
        qc.invalidateQueries({ queryKey: CONTROLLER_KEY })
      }
      return
    }
    case "playerDestroyed": {
      qc.setQueryData<ControllerData>(CONTROLLER_KEY, { player: null })
      return
    }
    case "trackEnd":
    case "voiceStateUpdate":
      return
  }
}

type SearchTrack = {
  encoded?: string
  info: { title?: string; author?: string; uri?: string; artworkUrl?: string }
}

function formatActionError(e: unknown): string {
  if (e instanceof Error) {
    const m = e.message.trim()
    return m.length > 220 ? `${m.slice(0, 220)}…` : m
  }
  return "Something went wrong."
}

type MeResponse = {
  userId: string
  username?: string
  globalName?: string
  avatarUrl?: string
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
      return r.json() as Promise<MeResponse>
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
    const es = new EventSource("/api/events", { withCredentials: true })
    es.onmessage = (ev) => {
      try {
        const envelope = JSON.parse(String(ev.data)) as SseEnvelope
        if (envelope.type !== "serverEvent") {
          return
        }
        applyServerEvent(qc, envelope.event)
      } catch {
        /* ignore */
      }
    }
    return () => es.close()
  }, [qc, wsConnected])

  const player = controllerQ.data?.player
  const guildId = player?.guildId ?? ""

  const postPlayerAction = useCallback(
    async (path: string, body: string): Promise<PlayerSnapshot | null> => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}${path}`,
        { method: "POST", body },
      )
      if (!r.ok) {
        throw new Error(await r.text())
      }
      const json = (await r.json().catch(() => null)) as
        | { player?: PlayerSnapshot | null }
        | null
      return json?.player ?? null
    },
    [guildId],
  )

  const handleMutationError = useCallback(
    (
      error: unknown,
      _variables: unknown,
      onMutateResult: MutationContext | undefined,
    ) => {
      if (onMutateResult?.previous !== undefined) {
        writeCachedController(qc, onMutateResult.previous)
      }
      setActionError(formatActionError(error))
    },
    [qc],
  )

  const handleMutationSuccess = useCallback(
    (player: PlayerSnapshot | null) => {
      if (player) {
        qc.setQueryData<ControllerData>(CONTROLLER_KEY, { player })
      }
      setActionError(null)
    },
    [qc],
  )

  const pauseMut = useMutation({
    mutationFn: () => postPlayerAction(`/pause`, "{}"),
    onMutate: () => {
      const previous = patchCachedPlayer(qc, (player) => {
        const nextPaused = !player.paused
        return {
          ...player,
          paused: nextPaused,
          playing: !nextPaused && !!player.current,
        }
      })
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  })

  const skipMut = useMutation({
    mutationFn: () => postPlayerAction(`/skip`, "{}"),
    onMutate: () => {
      const previous = patchCachedPlayer(qc, (player) => {
        const [next, ...rest] = player.queue
        return {
          ...player,
          current: next ?? null,
          queue: rest,
          position: 0,
          paused: false,
          playing: !!next,
        }
      })
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  })

  const stopMut = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/stop`,
        { method: "POST", body: "{}" },
      )
      if (!r.ok) throw new Error(await r.text())
      return null
    },
    onMutate: () => {
      const previous = qc.getQueryData<ControllerData>(CONTROLLER_KEY)
      qc.setQueryData<ControllerData>(CONTROLLER_KEY, { player: null })
      return { previous }
    },
    onSuccess: () => {
      setActionError(null)
      qc.setQueryData<ControllerData>(CONTROLLER_KEY, { player: null })
    },
    onError: handleMutationError,
  })

  const seekMut = useMutation({
    mutationFn: (positionMs: number) =>
      postPlayerAction(`/seek`, JSON.stringify({ positionMs })),
    onMutate: (positionMs) => {
      const previous = patchCachedPlayer(qc, (player) => ({
        ...player,
        position: positionMs,
      }))
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  })

  const volumeMut = useMutation({
    mutationFn: (volume: number) =>
      postPlayerAction(`/volume`, JSON.stringify({ volume })),
    onMutate: (volume) => {
      const previous = patchCachedPlayer(qc, (player) => ({
        ...player,
        volume,
      }))
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  })

  const loopMut = useMutation({
    mutationFn: (mode: LoopMode) =>
      postPlayerAction(`/loop`, JSON.stringify({ mode })),
    onMutate: (mode) => {
      const previous = patchCachedPlayer(qc, (player) => ({
        ...player,
        repeatMode: mode,
      }))
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  })

  const shuffleMut = useMutation({
    mutationFn: () => postPlayerAction(`/shuffle`, "{}"),
    onMutate: () => {
      const previous = qc.getQueryData<ControllerData>(CONTROLLER_KEY)
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  })

  const clearMut = useMutation({
    mutationFn: () => postPlayerAction(`/clear`, "{}"),
    onMutate: () => {
      const previous = patchCachedPlayer(qc, (player) => ({
        ...player,
        queue: [],
      }))
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
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
    mutationFn: async (encoded: string): Promise<PlayerSnapshot | null> => {
      const me = meQ.data
      if (!me?.userId) throw new Error("Not signed in")
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/queue`,
        {
          method: "POST",
          body: JSON.stringify({
            encoded,
            requesterId: me.userId,
            requesterName: me.globalName ?? me.username,
            requesterAvatarUrl: me.avatarUrl,
          }),
        },
      )
      if (!r.ok) throw new Error(await r.text())
      const json = (await r.json().catch(() => null)) as
        | { player?: PlayerSnapshot | null }
        | null
      return json?.player ?? null
    },
    onSuccess: (player) => {
      handleMutationSuccess(player)
      setSearch("")
    },
    onError: handleMutationError,
  })

  const removeMut = useMutation({
    mutationFn: async (index: number): Promise<PlayerSnapshot | null> => {
      const r = await apiFetch(
        `/api/players/${encodeURIComponent(guildId)}/queue/${index}`,
        { method: "DELETE" },
      )
      if (!r.ok) throw new Error(await r.text())
      const json = (await r.json().catch(() => null)) as
        | { player?: PlayerSnapshot | null }
        | null
      return json?.player ?? null
    },
    onMutate: (index) => {
      const previous = patchCachedPlayer(qc, (player) => ({
        ...player,
        queue: player.queue.filter((_, i) => i !== index),
      }))
      return { previous }
    },
    onSuccess: handleMutationSuccess,
    onError: handleMutationError,
  })

  const moveQueue = useCallback(
    async (from: number, to: number) => {
      if (from === to) return
      const previous = patchCachedPlayer(qc, (player) => {
        const queue: QueueItem[] = player.queue.slice()
        const len = queue.length
        if (from < 0 || from >= len || to < 0 || to >= len) {
          return player
        }
        const [moved] = queue.splice(from, 1)
        if (!moved) {
          return player
        }
        const insertPos = to > from ? to - 1 : to
        queue.splice(insertPos, 0, moved)
        return { ...player, queue }
      })
      setMovePending(true)
      setActionError(null)
      try {
        const r = await apiFetch(
          `/api/players/${encodeURIComponent(guildId)}/queue/move`,
          { method: "POST", body: JSON.stringify({ from, to }) },
        )
        if (!r.ok) {
          writeCachedController(qc, previous)
          setActionError(formatActionError(new Error(await r.text())))
          return
        }
        const json = (await r.json().catch(() => null)) as
          | { player?: PlayerSnapshot | null }
          | null
        if (json?.player) {
          qc.setQueryData<ControllerData>(CONTROLLER_KEY, {
            player: json.player,
          })
        }
      } catch (e) {
        writeCachedController(qc, previous)
        setActionError(formatActionError(e))
      } finally {
        setMovePending(false)
      }
    },
    [guildId, qc],
  )

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
      <PageGate
        eyebrow="Sign in"
        title="Sign in to enter the room."
        description="The room needs to know who you are before you can control playback."
        primary={{
          to: "/login",
          label: "Continue with Discord",
          icon: ArrowRightIcon,
        }}
      />
    )
  }

  if (controllerQ.isPending) {
    return <ControllerSkeleton />
  }

  if (!player) {
    return (
      <PageGate
        eyebrow="Voice channel"
        title="Join a voice channel first."
        description="Hop into the same voice channel as Loopify, then come back here."
        primary={{ to: "/", label: "Back home" }}
      />
    )
  }

  return (
    <ControllerProductSurface
      player={player}
      onPauseToggle={() => pauseMut.mutate(undefined)}
      onSkip={() => skipMut.mutate(undefined)}
      onStop={() => stopMut.mutate(undefined)}
      onSeek={(ms) => seekMut.mutate(ms)}
      onVolume={(v) => volumeMut.mutate(v)}
      onLoop={(mode) => loopMut.mutate(mode)}
      onShuffle={() => shuffleMut.mutate(undefined)}
      onClear={() => clearMut.mutate(undefined)}
      search={search}
      setSearch={setSearch}
      onSearch={() => searchMut.mutate(undefined)}
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

function ControllerSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <div className="flex flex-col items-center gap-8 lg:items-start">
          <Skeleton className="size-56 rounded-2xl sm:size-64 lg:size-72" />
          <div className="flex w-full max-w-md flex-col items-center gap-3 lg:items-start">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <Skeleton className="h-1.5 w-full rounded-full" />
          <div className="flex w-full items-center justify-center gap-5">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="size-11 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-48 rounded-full" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export { ControllerProductSurface }

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
    requesterName: "ada",
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
      requesterName: "june",
      info: {
        title: "Venice Bitch",
        author: "Lana Del Rey",
        duration: 583_000,
        artworkUrl: "https://picsum.photos/seed/loopify-d2/400/400",
      },
    },
    {
      encoded: "d3",
      requesterId: "x",
      requesterName: "ada",
      info: {
        title: "Cinnamon Girl",
        author: "Lana Del Rey",
        duration: 296_000,
        artworkUrl: "https://picsum.photos/seed/loopify-d3/400/400",
      },
    },
    {
      encoded: "d4",
      requesterId: "x",
      requesterName: "tomas",
      info: {
        title: "How to disappear",
        author: "Lana Del Rey",
        duration: 206_000,
        artworkUrl: "https://picsum.photos/seed/loopify-d4/400/400",
      },
    },
    {
      encoded: "d5",
      requesterId: "x",
      requesterName: "june",
      info: {
        title: "California",
        author: "Lana Del Rey",
        duration: 271_000,
        artworkUrl: "https://picsum.photos/seed/loopify-d5/400/400",
      },
    },
    {
      encoded: "d6",
      requesterId: "x",
      requesterName: "ada",
      info: {
        title: "The Greatest",
        author: "Lana Del Rey",
        duration: 280_000,
        artworkUrl: "https://picsum.photos/seed/loopify-d6/400/400",
      },
    },
  ],
  ping: { ws: 48, lavalink: 22 },
}
