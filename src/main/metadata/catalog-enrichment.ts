import type { TrackCandidate } from "../../shared/types/music"

type EnrichContext = {
  minScore: number
}

type Scored = {
  title: string
  artist: string | null
  artworkUrl: string | null
  score: number
  durationSec?: number
}

export function heuristicsTitleArtist(candidate: TrackCandidate): {
  title: string
  artist: string | null
} {
  if (candidate.artist) {
    return { title: candidate.title, artist: candidate.artist }
  }
  const t = candidate.title.trim()
  const topic = /\s*-\s*Topic$/i
  if (topic.test(t)) {
    return { title: t.replace(topic, "").trim(), artist: null }
  }
  const m = /^(.+?)\s*-\s*(.+)$/.exec(t)
  if (m) {
    const a = m[1].trim()
    const b = m[2].trim()
    if (a.length > 0 && b.length > 0) {
      if (/official|lyric|video|audio|mv\b/i.test(b)) {
        return { title: b.replace(/\s*[[(].*?[\])].*$/i, "").trim() || t, artist: a }
      }
      return { title: b, artist: a }
    }
  }
  return { title: candidate.title, artist: null }
}

export async function enrichTrackCandidate(
  candidate: TrackCandidate,
  ctx: EnrichContext
): Promise<TrackCandidate> {
  const { title, artist } = heuristicsTitleArtist(candidate)
  const q = [artist, title].filter(Boolean).join(" ").trim()
  if (q.length < 2) {
    return candidate
  }

  const fromItunes = await searchItunes(q, candidate, ctx.minScore)
  if (fromItunes) {
    return {
      ...candidate,
      title: fromItunes.title,
      artist: fromItunes.artist,
      thumbnailUrl: fromItunes.artworkUrl ?? candidate.thumbnailUrl,
    }
  }

  const fromDeezer = await searchDeezer(q, candidate, ctx.minScore)
  if (fromDeezer) {
    return {
      ...candidate,
      title: fromDeezer.title,
      artist: fromDeezer.artist,
      thumbnailUrl: fromDeezer.artworkUrl ?? candidate.thumbnailUrl,
    }
  }

  return candidate
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[[\](){}'".,!?/\\|`~@#$%^&*+=:;<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function tokenOverlap(a: string, b: string): number {
  const x = new Set(norm(a).split(" ").filter(Boolean))
  const y = new Set(norm(b).split(" ").filter(Boolean))
  if (x.size === 0 || y.size === 0) return 0
  let n = 0
  for (const t of x) {
    if (y.has(t)) n += 1
  }
  return n / Math.max(x.size, y.size)
}

function matchScore(
  expectTitle: string,
  expectArtist: string | null,
  gotTitle: string,
  gotArtist: string | null,
  durationMs: number | null,
  refDurationSec: number | undefined
): number {
  const t =
    0.55 * tokenOverlap(expectTitle, gotTitle) +
    0.25 * (expectArtist && gotArtist ? tokenOverlap(expectArtist, gotArtist) : 0.2)
  let d = 0.2
  if (typeof refDurationSec === "number" && refDurationSec > 0 && durationMs) {
    const dsec = refDurationSec * 1000
    const delta = Math.abs(durationMs - dsec)
    if (delta < 2000) d = 1
    else if (delta < 5000) d = 0.85
    else if (delta < 15000) d = 0.5
    else d = 0.1
  }
  return t + 0.2 * d
}

async function searchItunes(
  q: string,
  candidate: TrackCandidate,
  minScore: number
): Promise<Scored | null> {
  const url = new URL("https://itunes.apple.com/search")
  url.searchParams.set("term", q)
  url.searchParams.set("entity", "song")
  url.searchParams.set("limit", "12")
  url.searchParams.set("media", "music")
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return null
  const data = (await res.json()) as { results?: ItunesResult[] }
  const { title: eTitle, artist: eArtist } = heuristicsTitleArtist(candidate)
  let best: Scored | null = null
  for (const r of data.results ?? []) {
    if (!r.trackName) continue
    const gArtist = r.artistName ?? null
    const sc = matchScore(
      eTitle,
      eArtist,
      r.trackName,
      gArtist,
      candidate.durationMs,
      r.trackTimeMillis != null ? r.trackTimeMillis / 1000 : undefined
    )
    if (sc >= minScore && (!best || sc > best.score)) {
      const art = pickLargestItunesArtwork(r)
      best = { title: r.trackName, artist: gArtist, artworkUrl: art, score: sc }
    }
  }
  return best
}

type ItunesResult = {
  trackName?: string
  artistName?: string
  trackTimeMillis?: number
  artworkUrl100?: string
  artworkUrl30?: string
  artworkUrl60?: string
}

function pickLargestItunesArtwork(r: ItunesResult): string | null {
  const u = r.artworkUrl100 ?? r.artworkUrl60 ?? r.artworkUrl30
  if (!u) return null
  if (u.includes("itunes") || u.includes("mzstatic")) {
    return u.replace(/100x100|60x60|30x30/, "600x600")
  }
  return u
}

type DeezerTrack = {
  title: string
  artist?: { name?: string }
  duration?: number
  album?: { cover_xl?: string; cover_big?: string }
}

async function searchDeezer(
  q: string,
  candidate: TrackCandidate,
  minScore: number
): Promise<Scored | null> {
  const url = new URL("https://api.deezer.com/search")
  url.searchParams.set("q", q)
  url.searchParams.set("limit", "10")
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) return null
  const data = (await res.json()) as { data?: DeezerTrack[] }
  const { title: eTitle, artist: eArtist } = heuristicsTitleArtist(candidate)
  let best: Scored | null = null
  for (const r of data.data ?? []) {
    if (!r.title) continue
    const gArtist = r.artist?.name ?? null
    const durSec = typeof r.duration === "number" ? r.duration : undefined
    const sc = matchScore(eTitle, eArtist, r.title, gArtist, candidate.durationMs, durSec)
    if (sc >= minScore && (!best || sc > best.score)) {
      const art = r.album?.cover_xl ?? r.album?.cover_big ?? null
      best = { title: r.title, artist: gArtist, artworkUrl: art, score: sc, durationSec: durSec }
    }
  }
  return best
}
