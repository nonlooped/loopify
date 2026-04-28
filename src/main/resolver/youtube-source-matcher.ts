import type { CatalogTrack } from "../../shared/types/music"
import { normalize, tokenList, tokenOverlapScore, tokenSet } from "../../shared/utils/string"

export type MatcherEntry = {
  id?: string
  title?: string
  uploader?: string
  artist?: string
  duration?: number
  view_count?: number
  webpage_url?: string
  url?: string
}

export type ScoredEntry = {
  entry: MatcherEntry
  score: number
}

export const MATCH_THRESHOLD = 0.55

const NOISE_TERMS: Array<{ pattern: RegExp; penalty: number; suppressIfTitleHas?: RegExp }> = [
  { pattern: /\blive\b|\bconcert\b|\blive at\b/i, penalty: 0.4, suppressIfTitleHas: /\blive\b/i },
  { pattern: /\bremix\b|\bvip mix\b/i, penalty: 0.5, suppressIfTitleHas: /\bremix\b|\bvip mix\b/i },
  { pattern: /\bcover\b|\bcovered by\b/i, penalty: 0.5, suppressIfTitleHas: /\bcover\b/i },
  {
    pattern: /\bsped up\b|\bslowed\b|\bnightcore\b|\b8d\b|\bbass boosted\b|\breverb\b/i,
    penalty: 0.5,
  },
  {
    pattern: /\binstrumental\b|\bkaraoke\b/i,
    penalty: 0.4,
    suppressIfTitleHas: /\binstrumental\b/i,
  },
  { pattern: /\bamv\b|\bfan ?made\b|\bedit\b|\bmashup\b/i, penalty: 0.4 },
  { pattern: /\blyric video\b|\blyrics\b/i, penalty: 0.15 },
  { pattern: /\bshorts?\b|\btiktok\b/i, penalty: 0.3 },
]

export function pickBestMatch(entries: MatcherEntry[], catalog: CatalogTrack): ScoredEntry | null {
  const scored = entries
    .filter((e) => typeof e.duration === "number" && (e.id || e.url || e.webpage_url))
    .map((entry) => ({ entry, score: scoreEntry(entry, catalog) }))
    .filter((s) => s.score >= MATCH_THRESHOLD)

  if (scored.length === 0) return null

  scored.sort((a, b) => {
    const aTopic = isTopic(a.entry.uploader) ? 1 : 0
    const bTopic = isTopic(b.entry.uploader) ? 1 : 0
    if (aTopic !== bTopic) return bTopic - aTopic
    if (b.score !== a.score) return b.score - a.score
    const aDelta = durationDeltaMs(a.entry, catalog)
    const bDelta = durationDeltaMs(b.entry, catalog)
    if (aDelta !== bDelta) return aDelta - bDelta
    const aVevo = isVevo(a.entry.uploader) ? 1 : 0
    const bVevo = isVevo(b.entry.uploader) ? 1 : 0
    if (aVevo !== bVevo) return bVevo - aVevo
    return (b.entry.view_count ?? 0) - (a.entry.view_count ?? 0)
  })

  return scored[0]
}

export function scoreEntry(entry: MatcherEntry, catalog: CatalogTrack): number {
  const duration = 0.45 * durationScore(entry, catalog)
  const channel = 0.3 * channelScore(entry, catalog)
  const title = 0.15 * titleScore(entry, catalog)
  const artist = 0.1 * artistScore(entry, catalog)
  const noise = noisePenalty(entry, catalog)
  return duration + channel + title + artist - noise
}

function durationDeltaMs(entry: MatcherEntry, catalog: CatalogTrack): number {
  if (typeof entry.duration !== "number") return Number.POSITIVE_INFINITY
  return Math.abs(entry.duration * 1000 - catalog.durationMs)
}

function durationScore(entry: MatcherEntry, catalog: CatalogTrack): number {
  const delta = durationDeltaMs(entry, catalog)
  if (delta <= 1500) return 1.0
  if (delta <= 3000) return 0.85
  if (delta <= 6000) return 0.55
  if (delta <= 12000) return 0.2
  return 0
}

function channelScore(entry: MatcherEntry, catalog: CatalogTrack): number {
  const uploader = (entry.uploader ?? entry.artist ?? "").toLowerCase()
  const title = (entry.title ?? "").toLowerCase()
  if (!uploader && !title) return 0
  if (isTopic(uploader)) return 1.0
  if (isVevo(uploader)) return 0.9

  const uploaderTokens = tokenSet(uploader)
  const artistTokens = tokenList(catalog.artist)
  if (artistTokens.length > 0 && artistTokens.every((t) => uploaderTokens.has(t))) {
    return 0.8
  }

  if (/\bofficial audio\b/.test(title)) return 0.7
  if (/\bofficial (music )?video\b/.test(title)) return 0.4
  return 0.2
}

function titleScore(entry: MatcherEntry, catalog: CatalogTrack): number {
  const entryTitle = normalize(entry.title ?? "")
  const catalogTitle = normalize(catalog.title)
  if (!entryTitle || !catalogTitle) return 0
  if (entryTitle.includes(catalogTitle)) return 1.0
  return tokenOverlapScore(catalogTitle, entryTitle)
}

function artistScore(entry: MatcherEntry, catalog: CatalogTrack): number {
  const haystack = normalize(`${entry.uploader ?? ""} ${entry.title ?? ""}`)
  const catalogArtist = normalize(catalog.artist)
  if (!haystack || !catalogArtist) return 0
  if (haystack.includes(catalogArtist)) return 1.0
  return tokenOverlapScore(catalogArtist, haystack)
}

function noisePenalty(entry: MatcherEntry, catalog: CatalogTrack): number {
  const text = `${entry.title ?? ""} ${entry.uploader ?? ""}`
  const catalogTitle = catalog.title
  let total = 0
  for (const rule of NOISE_TERMS) {
    if (!rule.pattern.test(text)) continue
    if (rule.suppressIfTitleHas?.test(catalogTitle)) continue
    total += rule.penalty
  }
  return total
}

function isTopic(uploader: string | undefined): boolean {
  if (!uploader) return false
  return /\s-\s+topic\b/i.test(uploader) || /\btopic$/i.test(uploader.trim())
}

function isVevo(uploader: string | undefined): boolean {
  return !!uploader && /vevo/i.test(uploader)
}
