import pLimit from "p-limit"
import type { TrackCandidate } from "../../shared/types/music"
import { normalize, tokenList } from "../../shared/utils/string"
import { DeezerService } from "../catalog/deezer-service"
import { buildScsearchArg, buildYtsearchArg } from "../music/query-builders"
import type { ResolverService } from "../resolver/resolver-service"

export type SpotifyImportMetadataOptions = {
  deezerMatchThreshold: number
}

const SEARCH_TIMEOUT_MS = 8000
export const DEFAULT_MATCH_SCORE_THRESHOLD = 0.42

export type SpotifyRow = {
  title: string
  artist?: string
  durationMs?: number
}

function withTimeout<T>(task: Promise<T>, ms: number, message: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null
  return Promise.race([
    task,
    new Promise<never>((_, reject) => {
      t = setTimeout(() => reject(new Error(message)), ms)
    }),
  ]).finally(() => {
    if (t) clearTimeout(t)
  })
}

function similarity(left: string, right: string): number {
  const a = normalize(left)
  const b = normalize(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  const leftTokens = tokenList(a)
  const rightTokens = new Set(tokenList(b))
  if (!leftTokens.length || !rightTokens.size) return 0
  let n = 0
  for (const tok of leftTokens) {
    if (rightTokens.has(tok)) n += 1
  }
  return n / Math.max(leftTokens.length, rightTokens.size)
}

function durationSimilarity(expected: number | undefined, actualSec: number | undefined): number {
  if (!expected || !actualSec) return 0.6
  const actualMs = actualSec * 1000
  const delta = Math.abs(expected - actualMs)
  if (delta <= 2500) return 1
  if (delta <= 5000) return 0.9
  if (delta <= 10_000) return 0.7
  if (delta <= 15_000) return 0.45
  if (delta <= 30_000) return 0.2
  return 0
}

function trackMatchScore(
  expected: SpotifyRow,
  actual: { title: string; artist: string | null; durationSec?: number }
): number {
  const titleScore = similarity(expected.title, actual.title)
  const artistScore = expected.artist ? similarity(expected.artist, actual.artist ?? "") : 0.6
  const d = durationSimilarity(
    expected.durationMs,
    typeof actual.durationSec === "number" ? actual.durationSec : undefined
  )
  return titleScore * 0.7 + artistScore * 0.2 + d * 0.1
}

async function finalizeSpotifyMatch(
  matched: TrackCandidate,
  row: SpotifyRow,
  _metadata: SpotifyImportMetadataOptions | undefined
): Promise<TrackCandidate> {
  return {
    ...matched,
    title: row.title,
    artist: row.artist?.trim() || matched.artist,
    durationMs: row.durationMs ?? matched.durationMs,
  }
}

const deezer = new DeezerService()

export async function matchSpotifyRowToCandidate(
  resolver: ResolverService,
  row: SpotifyRow,
  threshold: number,
  metadata?: SpotifyImportMetadataOptions
): Promise<TrackCandidate | null> {
  const q = [row.title, row.artist].filter(Boolean).join(" ").trim()
  if (!q) return null

  const ytQ = buildYtsearchArg(q, 1)
  const catalogPromise = resolveViaDeezer(resolver, row, q, threshold)
  const ytPromise = withTimeout(
    resolver.getFirstSearchCandidate(ytQ),
    SEARCH_TIMEOUT_MS,
    "search timed out"
  ).catch(() => null)

  const catalogResult = await catalogPromise
  if (catalogResult) return catalogResult

  const yt = await ytPromise
  if (yt) {
    const s = trackMatchScore(row, {
      title: yt.title,
      artist: yt.artist,
      durationSec: yt.durationMs != null ? yt.durationMs / 1000 : undefined,
    })
    if (s >= threshold) {
      return finalizeSpotifyMatch(yt, row, metadata)
    }
  }

  const scQ = buildScsearchArg(q, 1)
  const sc = await withTimeout(
    resolver.getFirstSearchCandidate(scQ),
    SEARCH_TIMEOUT_MS,
    "search timed out"
  ).catch(() => null)
  if (sc) {
    const s = trackMatchScore(row, {
      title: sc.title,
      artist: sc.artist,
      durationSec: sc.durationMs != null ? sc.durationMs / 1000 : undefined,
    })
    if (s >= threshold) {
      return finalizeSpotifyMatch(sc, row, metadata)
    }
  }

  return null
}

async function resolveViaDeezer(
  resolver: ResolverService,
  row: SpotifyRow,
  query: string,
  threshold: number
): Promise<TrackCandidate | null> {
  try {
    const catalogHits = await withTimeout(
      deezer.searchTracks(query),
      SEARCH_TIMEOUT_MS,
      "catalog search timed out"
    )
    const topHit = catalogHits[0]
    if (!topHit) return null
    const catalogScore = trackMatchScore(row, {
      title: topHit.title,
      artist: topHit.artist,
      durationSec: topHit.durationMs / 1000,
    })
    if (catalogScore < threshold) return null
    const candidate = await withTimeout(
      resolver.resolveCatalog(topHit),
      SEARCH_TIMEOUT_MS,
      "source resolution timed out"
    )
    return {
      ...candidate,
      title: row.title,
      artist: row.artist?.trim() || candidate.artist,
      durationMs: row.durationMs ?? candidate.durationMs,
    }
  } catch {
    return null
  }
}

export async function matchAllSpotifyRows(
  resolver: ResolverService,
  rows: SpotifyRow[],
  concurrency: number,
  threshold: number,
  onRow: (p: { processed: number; matched: number; skipped: number }) => void,
  metadata?: SpotifyImportMetadataOptions
): Promise<TrackCandidate[]> {
  const out: TrackCandidate[] = []
  let processed = 0
  let matched = 0
  let skipped = 0
  let emittedAt = 0
  const limit = pLimit(concurrency)
  const tasks = rows.map((row) =>
    limit(() =>
      matchSpotifyRowToCandidate(resolver, row, threshold, metadata).then((c) => {
        processed += 1
        if (c) {
          matched += 1
          out.push(c)
        } else {
          skipped += 1
        }
        if (processed - emittedAt >= concurrency || processed === rows.length) {
          emittedAt = processed
          onRow({ processed, matched, skipped })
        }
        return c
      })
    )
  )
  await Promise.all(tasks)
  return out
}

export { SEARCH_TIMEOUT_MS }
