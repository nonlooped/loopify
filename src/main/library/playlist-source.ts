import type { ImportSourceKind } from "../../shared/types/music"

export const DEFAULT_IMPORT_MAX = 100

export type DetectedImportSource = {
  kind: ImportSourceKind
  /** Normalized share URL for the extractor. */
  normalizedUrl: string
}

function isYouTubeHost(host: string): boolean {
  return (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be" ||
    host.endsWith(".youtu.be")
  )
}

function isSpotifyHost(host: string): boolean {
  return (
    host === "open.spotify.com" || host.endsWith(".open.spotify.com") || host === "play.spotify.com"
  )
}

function spotifyPlaylistIdFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean)
  const idx = parts.indexOf("playlist")
  if (idx < 0) return null
  const v = parts[idx + 1]
  if (!v || !/^[A-Za-z0-9]+$/.test(v)) return null
  return v
}

export function detectImportSource(rawUrl: string): DetectedImportSource {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new Error("Invalid playlist URL.")
  }
  const host = parsed.hostname.toLowerCase()
  if (isYouTubeHost(host)) {
    if (!parsed.searchParams.get("list")) {
      throw new Error(
        "Use a YouTube playlist link with a list= parameter, or a Spotify playlist link."
      )
    }
    return { kind: "youtube", normalizedUrl: parsed.toString() }
  }
  if (isSpotifyHost(host)) {
    const pl = spotifyPlaylistIdFromPath(parsed.pathname)
    if (!pl) {
      throw new Error("Expected a Spotify playlist link (open.spotify.com/playlist/...).")
    }
    return { kind: "spotify", normalizedUrl: `https://open.spotify.com/playlist/${pl}` }
  }
  throw new Error(
    "Only YouTube and Spotify public playlist links are supported for this import flow."
  )
}
