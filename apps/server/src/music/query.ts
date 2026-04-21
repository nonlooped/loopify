import type { SearchQuery } from 'lavalink-client'

export function buildSearchQuery(raw: string): SearchQuery {
  const trimmed = raw.trim()
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }
  return { query: trimmed, source: 'ytsearch' }
}
