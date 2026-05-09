/** yt-dlp "source" argument: raw URL for links, or prefixed search. */
export function buildYtsearchArg(query: string, limit: number): string {
  return `ytsearch${Math.max(1, limit)}:${query.trim()}`
}

export function buildScsearchArg(query: string, limit: number): string {
  return `scsearch${Math.max(1, limit)}:${query.trim()}`
}
