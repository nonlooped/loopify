import { createHash } from "node:crypto"
import type {
  AppSettings,
  LyricsState,
  PlayerTrack,
  SyncedLyricLine,
} from "../../shared/types/music"
import type { LyricsCacheRepository } from "../db/repositories"

type LrclibResponse = {
  id?: number
  instrumental?: boolean
  plainLyrics?: string | null
  syncedLyrics?: string | null
  trackName?: string
  artistName?: string
  duration?: number
}

const LRCLIB_ENDPOINT = "https://lrclib.net/api/get"
const LRCLIB_SEARCH_ENDPOINT = "https://lrclib.net/api/search"
const LYRICA_FALLBACK_ENDPOINT = "https://test-0k.onrender.com/lyrics/"

type LyricaResponse = {
  status?: string
  data?: {
    hasTimestamps?: boolean
    instrumental?: boolean
    lyrics?: string | null
  }
}

export class LyricsService {
  private readonly cache: LyricsCacheRepository
  private readonly getSettings: () => AppSettings

  constructor(cache: LyricsCacheRepository, getSettings: () => AppSettings) {
    this.cache = cache
    this.getSettings = getSettings
  }

  async getForTrack(track: PlayerTrack): Promise<LyricsState> {
    const settings = this.getSettings()
    const cacheKey = createLyricsCacheKey(
      track,
      settings.communityLyricsFallbackEnabled ? "community-fallback" : "builtin-only"
    )
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const fetchedAt = Date.now()
    let state = await this.fetchSyncedLyrics(track, fetchedAt)
    if (
      settings.communityLyricsFallbackEnabled &&
      (state.status === "not-found" || state.status === "error")
    ) {
      state = await this.fetchCommunityFallbackLyrics(track, fetchedAt, state)
    }
    return this.cache.set({
      id: cacheKey,
      trackTitle: track.title,
      artist: track.artist,
      album: track.album,
      durationMs: track.durationMs,
      canonicalUrl: track.canonicalUrl,
      provider: track.provider,
      state,
    })
  }

  private async fetchSyncedLyrics(track: PlayerTrack, fetchedAt: number): Promise<LyricsState> {
    if (!track.title.trim() || !track.artist?.trim()) {
      return {
        status: "not-found",
        lyrics: null,
        reason: "Synced lyrics need both a track title and artist.",
      }
    }

    try {
      const url = new URL(LRCLIB_ENDPOINT)
      url.searchParams.set("track_name", track.title)
      url.searchParams.set("artist_name", track.artist)
      if (track.album?.trim()) {
        url.searchParams.set("album_name", track.album)
      }
      if (track.durationMs && track.durationMs > 0) {
        url.searchParams.set("duration", String(Math.round(track.durationMs / 1000)))
      }

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Loopify/0.1.0",
        },
      })

      if (response.status === 404) {
        return this.searchFallbackLyrics(track, fetchedAt)
      }
      if (!response.ok) {
        return {
          status: "error",
          lyrics: null,
          reason: `Lyrics lookup failed with status ${response.status}.`,
        }
      }

      const body = (await response.json()) as LrclibResponse
      return buildLyricsState(body, fetchedAt)
    } catch (error) {
      return {
        status: "error",
        lyrics: null,
        reason: error instanceof Error ? error.message : "Lyrics lookup failed.",
      }
    }
  }

  private async fetchCommunityFallbackLyrics(
    track: PlayerTrack,
    fetchedAt: number,
    currentState: LyricsState
  ): Promise<LyricsState> {
    try {
      const url = new URL(LYRICA_FALLBACK_ENDPOINT)
      url.searchParams.set("artist", track.artist ?? "")
      url.searchParams.set("song", track.title)

      const response = await fetch(url, {
        headers: {
          "User-Agent": "Loopify/0.1.0",
        },
      })
      if (!response.ok) {
        return currentState
      }

      const body = (await response.json()) as LyricaResponse
      const lyrics = body.data?.lyrics?.trim()
      if (!lyrics) {
        return currentState
      }
      if (body.data?.instrumental) {
        return {
          status: "instrumental",
          lyrics: null,
          reason: "This track is marked as instrumental.",
        }
      }

      return {
        status: "static",
        reason: null,
        lyrics: {
          source: "lyrica",
          providerTrackId: null,
          fetchedAt,
          text: lyrics,
        },
      }
    } catch {
      return currentState
    }
  }

  private async searchFallbackLyrics(track: PlayerTrack, fetchedAt: number): Promise<LyricsState> {
    const url = new URL(LRCLIB_SEARCH_ENDPOINT)
    url.searchParams.set("q", [track.title, track.artist].filter(Boolean).join(" "))
    if (track.artist?.trim()) {
      url.searchParams.set("artist_name", track.artist)
    }
    if (track.durationMs && track.durationMs > 0) {
      url.searchParams.set("duration", String(Math.round(track.durationMs / 1000)))
    }

    const response = await fetch(url, {
      headers: {
        "User-Agent": "Loopify/0.1.0",
      },
    })

    if (!response.ok) {
      return {
        status: "not-found",
        lyrics: null,
        reason: "No lyrics were found for this track.",
      }
    }

    const results = (await response.json()) as LrclibResponse[]
    const match = pickBestSearchMatch(track, results)
    if (!match) {
      return {
        status: "not-found",
        lyrics: null,
        reason: "No lyrics were found for this track.",
      }
    }

    return buildLyricsState(match, fetchedAt)
  }
}

export function parseLrc(input: string): SyncedLyricLine[] {
  const lines: SyncedLyricLine[] = []
  for (const rawLine of input.split(/\r?\n/)) {
    const timestamps = [...rawLine.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
    if (timestamps.length === 0) {
      continue
    }

    const text = rawLine.replace(/\[[^\]]+\]/g, "").trim()
    if (!text) {
      continue
    }

    for (const timestamp of timestamps) {
      const minutes = Number(timestamp[1])
      const seconds = Number(timestamp[2])
      const fraction = timestamp[3] ?? "0"
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) {
        continue
      }
      const paddedFraction = fraction.padEnd(3, "0").slice(0, 3)
      lines.push({
        timeSeconds: minutes * 60 + seconds + Number(paddedFraction) / 1000,
        text,
      })
    }
  }

  lines.sort((a, b) => a.timeSeconds - b.timeSeconds)
  return lines.map((line, index) => ({
    ...line,
    endTimeSeconds: lines[index + 1]?.timeSeconds,
  }))
}

export function createLyricsCacheKey(track: PlayerTrack, mode = "builtin-only"): string {
  const durationSeconds =
    track.durationMs == null ? "" : String(Math.round(track.durationMs / 1000))
  return createHash("sha256")
    .update(
      [
        mode,
        track.provider,
        normalizeIdentity(track.canonicalUrl),
        normalizeIdentity(track.title),
        normalizeIdentity(track.artist ?? ""),
        normalizeIdentity(track.album ?? ""),
        durationSeconds,
      ].join("\u001f")
    )
    .digest("hex")
}

function normalizeIdentity(value: string): string {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, " ")
}

function buildLyricsState(body: LrclibResponse, fetchedAt: number): LyricsState {
  if (body.instrumental) {
    return {
      status: "instrumental",
      lyrics: null,
      reason: "This track is marked as instrumental.",
    }
  }

  const syncedLyrics = body.syncedLyrics?.trim()
  if (syncedLyrics) {
    const lines = parseLrc(syncedLyrics)
    if (lines.length > 0) {
      return {
        status: "synced",
        reason: null,
        lyrics: {
          source: "lrclib",
          providerTrackId: body.id == null ? null : String(body.id),
          fetchedAt,
          lines,
        },
      }
    }
  }

  const plainLyrics = body.plainLyrics?.trim()
  if (plainLyrics) {
    return {
      status: "static",
      reason: null,
      lyrics: {
        source: "lrclib",
        providerTrackId: body.id == null ? null : String(body.id),
        fetchedAt,
        text: plainLyrics,
      },
    }
  }

  return {
    status: "not-found",
    lyrics: null,
    reason: syncedLyrics
      ? "Synced lyrics were empty or unreadable."
      : "No lyrics were found for this track.",
  }
}

function pickBestSearchMatch(track: PlayerTrack, results: LrclibResponse[]): LrclibResponse | null {
  const normalizedTitle = normalizeIdentity(track.title)
  const normalizedArtist = normalizeIdentity(track.artist ?? "")
  const targetDurationSeconds =
    track.durationMs && track.durationMs > 0 ? Math.round(track.durationMs / 1000) : null

  let best: { score: number; item: LrclibResponse } | null = null
  for (const item of results) {
    const itemTitle = normalizeIdentity(item.trackName ?? "")
    const itemArtist = normalizeIdentity(item.artistName ?? "")
    const hasLyrics = Boolean(item.syncedLyrics?.trim() || item.plainLyrics?.trim())
    if (!hasLyrics) {
      continue
    }

    let score = 0
    if (itemTitle === normalizedTitle) {
      score += 4
    } else if (itemTitle.includes(normalizedTitle) || normalizedTitle.includes(itemTitle)) {
      score += 2
    }

    if (normalizedArtist && itemArtist === normalizedArtist) {
      score += 4
    } else if (
      normalizedArtist &&
      (itemArtist.includes(normalizedArtist) || normalizedArtist.includes(itemArtist))
    ) {
      score += 2
    }

    if (targetDurationSeconds != null && item.duration != null) {
      const delta = Math.abs(targetDurationSeconds - item.duration)
      if (delta <= 2) {
        score += 2
      } else if (delta <= 5) {
        score += 1
      } else if (delta >= 12) {
        score -= 3
      }
    }

    if (score < 6) {
      continue
    }

    if (!best || score > best.score) {
      best = { score, item }
    }
  }

  return best?.item ?? null
}
