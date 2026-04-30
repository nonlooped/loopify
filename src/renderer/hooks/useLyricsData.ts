import { useEffect, useMemo, useState } from "react"
import type { LyricsState, PlayerTrack, SyncedLyricLine } from "src/shared/types/music"

type LyricsLoadState =
  | { phase: "idle"; result: null }
  | { phase: "loading"; result: null }
  | { phase: "ready"; result: LyricsState }

export function useLyricsData(track: PlayerTrack | null) {
  const [loadState, setLoadState] = useState<LyricsLoadState>({ phase: "idle", result: null })

  const trackTitle = track?.title ?? null
  const trackArtist = track?.artist ?? null
  const trackAlbum = track?.album ?? null
  const trackDurationMs = track?.durationMs ?? null
  const trackThumbnailUrl = track?.thumbnailUrl ?? null
  const trackCanonicalUrl = track?.canonicalUrl ?? null
  const trackProvider = track?.provider ?? null

  const hasTrack = trackTitle && trackCanonicalUrl && trackProvider

  useEffect(() => {
    if (!hasTrack) {
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
        if (!cancelled) setLoadState({ phase: "ready", result })
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
    trackThumbnailUrl,
    trackTitle,
    trackProvider,
    hasTrack,
  ])

  const lines: SyncedLyricLine[] =
    loadState.result?.status === "synced" ? loadState.result.lyrics.lines : []
  const staticLyrics: string | null =
    loadState.result?.status === "static" ? loadState.result.lyrics.text : null

  return { loadState, lines, staticLyrics, hasTrack: Boolean(hasTrack) }
}

function findActiveLyricIndex(lines: SyncedLyricLine[], positionSeconds: number): number {
  if (lines.length === 0) return -1
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

export function useActiveLyricIndex(lines: SyncedLyricLine[], positionSeconds: number): number {
  return useMemo(() => findActiveLyricIndex(lines, positionSeconds), [lines, positionSeconds])
}
