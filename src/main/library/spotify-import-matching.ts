import type { TrackCandidate } from "../../shared/types/music"
import { enrichTrackCandidate } from "../metadata/catalog-enrichment"
import { buildScsearchArg, buildYtsearchArg } from "../music/query-builders"
import type { ResolverService } from "../resolver/resolver-service"

export type SpotifyImportMetadataOptions = {
  enrichmentEnabled: boolean
  minScore: number
}

const MATCH_CONCURRENCY = 4
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

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[[\](){}'".,!?/\\|`~@#$%^&*+=:;<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function similarity(left: string, right: string): number {
  const a = normalizeText(left)
  const b = normalizeText(right)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  const leftTokens = new Set(a.split(" ").filter(Boolean))
  const rightTokens = new Set(b.split(" ").filter(Boolean))
  if (!leftTokens.size || !rightTokens.size) return 0
  let n = 0
  for (const tok of leftTokens) {
    if (rightTokens.has(tok)) n += 1
  }
  return n / Math.max(leftTokens.size, rightTokens.size)
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
  metadata: SpotifyImportMetadataOptions | undefined
): Promise<TrackCandidate> {
  const merged: TrackCandidate = {
    ...matched,
    title: row.title,
    artist: row.artist?.trim() || matched.artist,
    durationMs: row.durationMs ?? matched.durationMs,
  }
  if (metadata?.enrichmentEnabled) {
    return enrichTrackCandidate(merged, { minScore: metadata.minScore })
  }
  return merged
}

export async function matchSpotifyRowToCandidate(
  resolver: ResolverService,
  row: SpotifyRow,
  threshold: number,
  metadata?: SpotifyImportMetadataOptions
): Promise<TrackCandidate | null> {
  const q = [row.title, row.artist].filter(Boolean).join(" ").trim()
  if (!q) return null
  const ytQ = buildYtsearchArg(q, 1)
  const yt = await withTimeout(
    resolver.getFirstSearchCandidate(ytQ),
    SEARCH_TIMEOUT_MS,
    "search timed out"
  ).catch(() => null)
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
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency)
    const part = await Promise.all(
      batch.map((r) => matchSpotifyRowToCandidate(resolver, r, threshold, metadata))
    )
    for (let j = 0; j < part.length; j++) {
      const c = part[j]
      processed += 1
      if (c) {
        matched += 1
        out.push(c)
      } else {
        skipped += 1
      }
    }
    onRow({ processed, matched, skipped })
  }
  return out
}

export { MATCH_CONCURRENCY, SEARCH_TIMEOUT_MS }
