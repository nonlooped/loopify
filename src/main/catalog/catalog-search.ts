import type { CatalogTrack } from "../../shared/types/music"

const REQUEST_TIMEOUT_MS = 6_000
const PER_PROVIDER_LIMIT = 15
const RETURN_LIMIT = 12

const RESULT_CACHE_TTL_MS = 10 * 60 * 1000
const RESULT_CACHE_MAX_ENTRIES = 200
const resultCache = new Map<string, { results: CatalogTrack[]; expiresAt: number }>()

function cacheKey(query: string): string {
  return query.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim()
}

function getCachedResults(key: string): CatalogTrack[] | null {
  const entry = resultCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    resultCache.delete(key)
    return null
  }
  // refresh insertion order so frequently-used queries survive eviction
  resultCache.delete(key)
  resultCache.set(key, entry)
  return entry.results
}

function setCachedResults(key: string, results: CatalogTrack[]): void {
  resultCache.set(key, { results, expiresAt: Date.now() + RESULT_CACHE_TTL_MS })
  while (resultCache.size > RESULT_CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next().value
    if (oldest === undefined) break
    resultCache.delete(oldest)
  }
}

type ItunesResult = {
  trackId?: number
  trackName?: string
  artistName?: string
  collectionName?: string
  trackTimeMillis?: number
  artworkUrl100?: string
  artworkUrl60?: string
  artworkUrl30?: string
  isrc?: string
}

type DeezerResult = {
  id?: number
  title?: string
  duration?: number
  isrc?: string
  artist?: { name?: string }
  album?: { title?: string; cover_xl?: string; cover_big?: string; cover_medium?: string }
}

export async function searchCatalog(rawQuery: string): Promise<CatalogTrack[]> {
  const query = rawQuery.trim()
  if (!query) return []

  const key = cacheKey(query)
  const cached = getCachedResults(key)
  if (cached) return cached

  const [itunes, deezer] = await Promise.allSettled([searchItunes(query), searchDeezer(query)])

  const itunesHits = itunes.status === "fulfilled" ? itunes.value : []
  const deezerHits = deezer.status === "fulfilled" ? deezer.value : []

  if (itunesHits.length === 0 && deezerHits.length === 0) {
    if (itunes.status === "rejected" && deezer.status === "rejected") {
      throw new Error("Catalog search failed. Check your network connection.")
    }
    return []
  }

  const queryTokens = tokenize(query)

  const ranked = dedupe([...itunesHits, ...deezerHits])
    .map((t) => ({ track: t, score: relevanceScore(t, queryTokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.track)
    .slice(0, RETURN_LIMIT)

  setCachedResults(key, ranked)
  return ranked
}

async function fetchCatalog(url: URL, provider: string): Promise<Response> {
  const res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
  if (!res.ok) throw new Error(`${provider} search returned ${res.status}`)
  return res
}

async function searchItunes(query: string): Promise<CatalogTrack[]> {
  const url = new URL("https://itunes.apple.com/search")
  url.searchParams.set("term", query)
  url.searchParams.set("entity", "song")
  url.searchParams.set("media", "music")
  url.searchParams.set("limit", String(PER_PROVIDER_LIMIT))

  const res = await fetchCatalog(url, "iTunes")
  const data = (await res.json()) as { results?: ItunesResult[] }
  const out: CatalogTrack[] = []
  for (const r of data.results ?? []) {
    if (!r.trackName || !r.artistName || !r.trackTimeMillis || !r.trackId) continue
    out.push({
      catalogProvider: "itunes",
      catalogId: String(r.trackId),
      title: r.trackName,
      artist: r.artistName,
      album: r.collectionName ?? null,
      artworkUrl: pickItunesArtwork(r),
      durationMs: r.trackTimeMillis,
      isrc: r.isrc ?? null,
    })
  }
  return out
}

async function searchDeezer(query: string): Promise<CatalogTrack[]> {
  const url = new URL("https://api.deezer.com/search")
  url.searchParams.set("q", query)
  url.searchParams.set("limit", String(PER_PROVIDER_LIMIT))

  const res = await fetchCatalog(url, "Deezer")

  const data = (await res.json()) as { data?: DeezerResult[] }
  const out: CatalogTrack[] = []
  for (const r of data.data ?? []) {
    if (!r.title || !r.artist?.name || !r.duration || !r.id) continue
    out.push({
      catalogProvider: "deezer",
      catalogId: String(r.id),
      title: r.title,
      artist: r.artist.name,
      album: r.album?.title ?? null,
      artworkUrl: r.album?.cover_xl ?? r.album?.cover_big ?? r.album?.cover_medium ?? null,
      durationMs: r.duration * 1000,
      isrc: r.isrc ?? null,
    })
  }
  return out
}

function pickItunesArtwork(r: ItunesResult): string | null {
  const u = r.artworkUrl100 ?? r.artworkUrl60 ?? r.artworkUrl30
  if (!u) return null
  if (u.includes("itunes") || u.includes("mzstatic")) {
    return u.replace(/\/\d+x\d+(bb)?\.(jpg|png)/i, "/600x600bb.$2")
  }
  return u
}

function dedupe(tracks: CatalogTrack[]): CatalogTrack[] {
  const seen = new Set<string>()
  const out: CatalogTrack[] = []
  for (const t of tracks) {
    const isrcKey = t.isrc ? `isrc:${t.isrc.toLowerCase()}` : null
    const titleArtistKey = `ta:${normalize(t.title)}|${normalize(t.artist)}`
    const key = isrcKey ?? titleArtistKey
    if (seen.has(key)) continue
    if (isrcKey) seen.add(isrcKey)
    seen.add(titleArtistKey)
    out.push(t)
  }
  return out
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
}

function tokenize(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean)
}

/** Cover/karaoke/instrumental variants that should rank last. */
const VARIANT_PATTERN =
  /originally performed by|karaoke|piano version|instrumental|chiptune|lofi|lo-fi|sped up|slowed|nightcore|8d|reverb|bass boosted|tribute to|made famous|in the style of/i

function relevanceScore(track: CatalogTrack, queryTokens: string[]): number {
  if (queryTokens.length === 0) return 1

  const titleTokens = tokenize(track.title)
  const artistTokens = tokenize(track.artist)

  // how many query tokens appear in the title (exact or contained)
  let titleHits = 0
  for (const qt of queryTokens) {
    if (titleTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t))) titleHits++
  }

  // must share at least one token with the title, otherwise it's unrelated
  if (titleHits === 0) return 0

  const titleRatio = titleHits / queryTokens.length

  // bonus when the artist also matches a query token (catches "artist song" queries)
  let artistHits = 0
  for (const qt of queryTokens) {
    if (artistTokens.some((t) => t === qt || t.includes(qt) || qt.includes(t))) artistHits++
  }
  const artistBonus = artistHits > 0 ? 0.15 : 0

  // penalise cover/karaoke/variant releases so originals surface first
  const variantPenalty = VARIANT_PATTERN.test(track.title) ? 0.4 : 0

  return Math.max(0, titleRatio * 0.85 + artistBonus - variantPenalty)
}
