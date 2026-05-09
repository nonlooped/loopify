/**
 * Normalizes text for comparison by lowering case, removing brackets,
 * and stripping non-alphanumeric characters.
 */
export function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Splits text into a list of unique normalized tokens.
 */
export function tokenList(value: string): string[] {
  return normalize(value).split(" ").filter(Boolean)
}

/**
 * Returns a Set of normalized tokens for O(1) lookups.
 */
export function tokenSet(value: string): Set<string> {
  return new Set(tokenList(value))
}

/**
 * Calculates a simple overlap score between two strings based on common tokens.
 */
export function tokenOverlapScore(needle: string, haystack: string): number {
  const needleTokens = tokenList(needle)
  const haystackTokens = tokenSet(haystack)
  if (needleTokens.length === 0 || haystackTokens.size === 0) return 0

  let hits = 0
  for (const t of needleTokens) {
    if (haystackTokens.has(t)) hits += 1
  }

  const ratio = hits / needleTokens.length
  if (ratio >= 0.8) return 0.7
  if (ratio >= 0.5) return 0.4
  return 0
}

export function tokenOverlapRatio(a: string, b: string): number {
  const normA = normalize(a)
  const normB = normalize(b)
  if (!normA || !normB) return 0
  if (normA === normB) return 1
  if (normA.includes(normB) || normB.includes(normA)) return 0.9
  const leftTokens = tokenList(normA)
  const rightTokens = tokenSet(normB)
  if (!leftTokens.length || !rightTokens.size) return 0
  let hits = 0
  for (const t of leftTokens) {
    if (rightTokens.has(t)) hits += 1
  }
  return hits / Math.max(leftTokens.length, rightTokens.size)
}

export function durationSimilarity(expectedSec: number, actualSec: number): number {
  const expected = Math.max(expectedSec, 1)
  const delta = Math.abs(expected - actualSec)
  if (delta > 30) return 0
  return 1 - Math.min(delta / expected, 1)
}
