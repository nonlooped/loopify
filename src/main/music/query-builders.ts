/**
 * Map user input to yt-dlp source arguments (legacy Loopify: URL passthrough, else ytsearch).
 */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim())
}

/** yt-dlp "source" argument: raw URL for links, or prefixed search. */
export function buildYtdlpSourceArgForSearch(raw: string, limit = 10): string {
  const trimmed = raw.trim()
  if (!trimmed) return `ytsearch${limit}:`
  if (isHttpUrl(trimmed)) return trimmed
  return `ytsearch${limit}:${trimmed}`
}

export function buildYtsearchArg(query: string, limit: number): string {
  return `ytsearch${Math.max(1, limit)}:${query.trim()}`
}

export function buildScsearchArg(query: string, limit: number): string {
  return `scsearch${Math.max(1, limit)}:${query.trim()}`
}
