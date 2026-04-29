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
 * Splits text into normalized tokens (alias for tokenList for semantic clarity).
 */
export function tokenize(value: string): string[] {
  return tokenList(value)
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
