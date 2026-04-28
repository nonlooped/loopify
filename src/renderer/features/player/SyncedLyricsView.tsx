import { Captions, Loader2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import type { LyricsState, PlayerTrack, SyncedLyricLine } from "src/shared/types/music"
import { EmptyState } from "@/components/EmptyState"
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion"
import { cn } from "@/lib/cn"

type LyricsLoadState =
  | { phase: "idle"; result: null }
  | { phase: "loading"; result: null }
  | { phase: "ready"; result: LyricsState }

type SyncedLyricsViewProps = {
  track: PlayerTrack | null
  positionSeconds: number
  onSeek: (seconds: number) => void
}

export function SyncedLyricsView({ track, positionSeconds, onSeek }: SyncedLyricsViewProps) {
  const [loadState, setLoadState] = useState<LyricsLoadState>({ phase: "idle", result: null })
  const scrollRootRef = useRef<HTMLElement | null>(null)
  const userScrollUntilRef = useRef(0)
  const scrollTimerRef = useRef<number | null>(null)
  const reducedMotion = usePrefersReducedMotion()
  const trackTitle = track?.title ?? null
  const trackArtist = track?.artist ?? null
  const trackAlbum = track?.album ?? null
  const trackDurationMs = track?.durationMs ?? null
  const trackThumbnailUrl = track?.thumbnailUrl ?? null
  const trackCanonicalUrl = track?.canonicalUrl ?? null
  const trackProvider = track?.provider ?? null

  useEffect(() => {
    if (!trackTitle || !trackCanonicalUrl || !trackProvider) {
      setLoadState({ phase: "idle", result: null })
      return
    }

    let cancelled = false
    setLoadState({ phase: "loading", result: null })
    window.loopify.lyrics
      .getForTrack({
        title: trackTitle,
        artist: trackArtist,
        album: trackAlbum,
        durationMs: trackDurationMs,
        thumbnailUrl: trackThumbnailUrl,
        canonicalUrl: trackCanonicalUrl,
        provider: trackProvider,
      })
      .then((result) => {
        if (!cancelled) {
          setLoadState({ phase: "ready", result })
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadState({
            phase: "ready",
            result: {
              status: "error",
              lyrics: null,
              reason: error instanceof Error ? error.message : "Could not load synced lyrics.",
            },
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [
    trackAlbum,
    trackArtist,
    trackCanonicalUrl,
    trackDurationMs,
    trackProvider,
    trackThumbnailUrl,
    trackTitle,
  ])

  const lines = loadState.result?.status === "synced" ? loadState.result.lyrics.lines : []
  const activeIndex = useMemo(
    () => findActiveLyricIndex(lines, positionSeconds),
    [lines, positionSeconds]
  )
  const staticLyrics = loadState.result?.status === "static" ? loadState.result.lyrics.text : null

  useEffect(() => {
    if (activeIndex < 0 || Date.now() < userScrollUntilRef.current) {
      return
    }
    const root = scrollRootRef.current
    const active = root?.querySelector<HTMLElement>("[data-active='true']")
    active?.scrollIntoView({
      block: "center",
      behavior: reducedMotion ? "auto" : "smooth",
    })
  }, [activeIndex, reducedMotion])

  const handleScroll = () => {
    userScrollUntilRef.current = Date.now() + 2500
    if (scrollTimerRef.current != null) {
      window.clearTimeout(scrollTimerRef.current)
    }
    scrollTimerRef.current = window.setTimeout(() => {
      userScrollUntilRef.current = 0
      scrollTimerRef.current = null
    }, 2500)
  }

  useEffect(() => {
    return () => {
      if (scrollTimerRef.current != null) {
        window.clearTimeout(scrollTimerRef.current)
      }
    }
  }, [])

  if (!trackTitle || !trackCanonicalUrl || !trackProvider) {
    return <LyricsEmptyState title="No track" message="Start playback to show synced lyrics." />
  }

  if (loadState.phase === "loading") {
    return (
      <div className="flex min-h-0 flex-1 w-full flex-col items-center justify-center gap-3 px-6 text-muted">
        <Loader2 className="h-6 w-6 animate-spin-slow text-accent" aria-hidden />
        <p className="type-body-sm m-0">Finding synced lyrics</p>
      </div>
    )
  }

  if (loadState.result?.status !== "synced") {
    if (loadState.result?.status === "static") {
      return <StaticLyricsView text={staticLyrics} />
    }

    return (
      <LyricsEmptyState
        title={
          loadState.result?.status === "instrumental"
            ? "Instrumental track"
            : "Synced lyrics unavailable"
        }
        message={loadState.result?.reason ?? "No synced lyrics were found for this track."}
      />
    )
  }

  return (
    <section
      ref={scrollRootRef}
      onScroll={handleScroll}
      className="relative flex min-h-0 flex-1 w-full max-w-[44rem] self-center overflow-y-auto px-2 py-[16vh] text-left sm:px-6 sm:py-[18vh]"
      aria-label="Synced lyrics"
    >
      <div className="flex flex-col gap-2">
        {lines.map((line, index) => {
          const isActive = index === activeIndex
          return (
            <button
              key={`${line.timeSeconds}-${line.endTimeSeconds ?? "end"}-${line.text}`}
              type="button"
              data-active={isActive ? "true" : undefined}
              onClick={() => onSeek(line.timeSeconds)}
              className={cn(
                "cursor-pointer rounded-xl px-4 py-2.5 text-left text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] transition-[color,opacity,transform,background-color] duration-ui ease-out-quart focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-reduce:transition-none sm:text-[1.9rem]",
                isActive
                  ? "translate-x-1 bg-white/[0.06] text-foreground opacity-100"
                  : "text-muted/72 opacity-70 hover:bg-white/[0.035] hover:text-muted hover:opacity-95 motion-reduce:translate-x-0"
              )}
              title={`Seek to ${formatLyricTime(line.timeSeconds)}`}
            >
              {line.text}
            </button>
          )
        })}
      </div>
    </section>
  )
}

function LyricsEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-0 flex-1 w-full items-center justify-center px-6">
      <EmptyState
        className="w-full max-w-xl"
        icon={<Captions className="h-6 w-6" aria-hidden />}
        eyebrow="Lyrics"
        title={title}
        description={message}
      />
    </div>
  )
}

function StaticLyricsView({ text }: { text: string | null }) {
  if (!text?.trim()) {
    return (
      <LyricsEmptyState title="Lyrics unavailable" message="No lyrics were found for this track." />
    )
  }

  const lines = text.split(/\r?\n/)

  return (
    <section
      className="relative flex min-h-0 flex-1 w-full max-w-[44rem] self-center overflow-y-auto px-2 py-[16vh] text-left sm:px-6 sm:py-[18vh]"
      aria-label="Lyrics"
    >
      <div className="flex flex-col gap-2">
        {lines.map((line, index) => {
          if (!line.trim()) {
            // biome-ignore lint/suspicious/noArrayIndexKey: Static array mapping
            return <div key={index} className="h-3 sm:h-4" aria-hidden />
          }
          const i = index
          return (
            <p
              key={`static-line-${i}`}
              className="m-0 rounded-xl px-4 py-2.5 text-left text-[1.55rem] font-semibold leading-tight tracking-[-0.025em] text-muted opacity-90 transition-colors duration-ui hover:text-foreground sm:text-[1.9rem]"
            >
              {line}
            </p>
          )
        })}
      </div>
    </section>
  )
}

function findActiveLyricIndex(lines: SyncedLyricLine[], positionSeconds: number): number {
  if (lines.length === 0) {
    return -1
  }
  let active = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeSeconds <= positionSeconds + 0.12) {
      active = i
    } else {
      break
    }
  }
  return active
}

function formatLyricTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = Math.floor(seconds % 60)
  return `${minutes}:${rest.toString().padStart(2, "0")}`
}
