import { spawn } from "node:child_process"
import ms from "ms"
import pLimit from "p-limit"
import type {
  CatalogTrack,
  Provider,
  ResolvedTrack,
  TrackCandidate,
} from "../../shared/types/music"
import { searchCatalog } from "../catalog/catalog-search"
import type { ResolverCacheRepository, SettingsRepository } from "../db/repositories"
import { enrichTrackCandidate } from "../metadata/catalog-enrichment"
import { buildYtsearchArg } from "../music/query-builders"
import { resolveYtdlpPath } from "./resolve-ytdlp"
import { type MatcherEntry, pickBestMatch } from "./youtube-source-matcher"

const ENRICHMENT_CONCURRENCY = 4

type YtdlpEntry = {
  id?: string
  title?: string
  uploader?: string
  artist?: string
  duration?: number
  thumbnail?: string
  webpage_url?: string
  original_url?: string
  extractor_key?: string
  url?: string
  view_count?: number
  entries?: YtdlpEntry[]
}

export type PlaylistResolution = {
  title: string
  tracks: TrackCandidate[]
  /** True when the source had more items than the import cap. */
  truncated: boolean
  sourceTrackCount: number
}

export const YT_FORMAT_PLAY = "bestaudio/best"

const STAGE2_SEARCH_LIMIT = 8

export type CandidateEnrichedListener = (sourceUrl: string, candidate: TrackCandidate) => void

export class ResolverService {
  private readonly inFlight = new Map<string, Promise<ResolvedTrack>>()
  private readonly inFlightStream = new Map<string, Promise<string | null>>()
  private readonly inFlightCatalog = new Map<string, Promise<TrackCandidate>>()
  private readonly inFlightEnrichment = new Map<string, Promise<void>>()
  private readonly enrichmentQueue = pLimit(ENRICHMENT_CONCURRENCY)
  private onCandidateEnriched: CandidateEnrichedListener | null = null

  constructor(
    private readonly settings: SettingsRepository,
    private readonly cache: ResolverCacheRepository
  ) {}

  setOnCandidateEnriched(listener: CandidateEnrichedListener | null): void {
    this.onCandidateEnriched = listener
  }

  primeCandidate(candidate: TrackCandidate): void {
    this.cache.setResolved(candidate.sourceUrl, {
      candidate,
      streamUrl: null,
      expiresAt: this.metadataExpiresAt(),
      streamExpiresAt: null,
    })
  }

  async resolve(input: string): Promise<ResolvedTrack> {
    const source = input.trim()
    if (!source) {
      throw new Error("Enter a URL or search query.")
    }

    const pending = this.inFlight.get(source)
    if (pending) {
      return pending
    }

    const promise = this.resolveInternal(source).finally(() => {
      this.inFlight.delete(source)
    })
    this.inFlight.set(source, promise)
    return promise
  }

  private async resolveInternal(source: string): Promise<ResolvedTrack> {
    const settings = this.settings.get()
    const cached = this.cache.getFresh(source)
    if (cached?.streamUrl) {
      return {
        candidate: cached.candidate,
        streamUrl: cached.streamUrl,
        expiresAt: cached.expiresAt,
      }
    }
    if (cached?.candidate && !cached.streamUrl) {
      const streamUrl = await this.fillStreamUrl(source, cached.candidate)
      return {
        candidate: cached.candidate,
        streamUrl,
        expiresAt: cached.expiresAt,
      }
    }

    const result = await this.runYtdlp(
      ["--dump-single-json", "--no-playlist", "--no-warnings", "--format", YT_FORMAT_PLAY, source],
      settings.resolverTimeoutMs
    )
    const base = this.toCandidate(result, source)
    const streamUrl = result.url ?? null
    const expiresAt = this.metadataExpiresAt()
    this.cache.setResolved(source, {
      candidate: base,
      streamUrl,
      expiresAt,
      streamExpiresAt: this.streamExpiresAt(streamUrl),
    })

    if (settings.metadataEnrichmentEnabled) {
      this.enrichInBackground(source, base, streamUrl)
    }

    return {
      candidate: base,
      streamUrl,
      expiresAt,
    }
  }

  private enrichInBackground(source: string, base: TrackCandidate, streamUrl: string | null): void {
    if (this.inFlightEnrichment.has(source)) return
    const settings = this.settings.get()
    const promise = this.enrichmentQueue(() =>
      enrichTrackCandidate(base, { minScore: settings.metadataMinScore })
        .then((enriched) => {
          if (enriched === base) return
          this.cache.setResolved(source, {
            candidate: enriched,
            streamUrl,
            expiresAt: this.metadataExpiresAt(),
            streamExpiresAt: this.streamExpiresAt(streamUrl),
          })
          this.onCandidateEnriched?.(source, enriched)
        })
        .catch(() => {
          // enrichment failures are non-fatal; raw candidate is already cached
        })
        .finally(() => {
          this.inFlightEnrichment.delete(source)
        })
    )
    this.inFlightEnrichment.set(source, promise)
  }

  private async fillStreamUrl(source: string, candidate: TrackCandidate): Promise<string | null> {
    const p = this.inFlightStream.get(source)
    if (p) return p
    const promise = this.runYtdlp(
      ["--dump-single-json", "--no-playlist", "--no-warnings", "--format", YT_FORMAT_PLAY, source],
      this.settings.get().resolverTimeoutMs
    )
      .then((r) => {
        const url = r.url ?? null
        this.cache.setResolved(source, {
          candidate,
          streamUrl: url,
          expiresAt: this.metadataExpiresAt(),
          streamExpiresAt: this.streamExpiresAt(url),
        })
        return url
      })
      .finally(() => {
        this.inFlightStream.delete(source)
      })
    this.inFlightStream.set(source, promise)
    return promise
  }

  private metadataExpiresAt(): number {
    return Date.now() + ms(`${this.settings.get().cacheTtlHours}h`)
  }

  private streamExpiresAt(streamUrl: string | null): number {
    const configured = Date.now() + ms(`${this.settings.get().streamCacheTtlMinutes}m`)
    if (!streamUrl) return configured
    const fromUrl = parseStreamExpiryMs(streamUrl)
    if (fromUrl === null) return configured
    return Math.min(configured, fromUrl)
  }

  /**
   * First search hit (ytsearchN / scsearchN or URL).
   * Used for Spotify import matching.
   */
  async getFirstSearchCandidate(sourceArg: string): Promise<TrackCandidate | null> {
    const result = await this.runYtdlp(
      ["--dump-single-json", "--flat-playlist", "--no-warnings", sourceArg],
      this.settings.get().resolverTimeoutMs
    )
    if (result.entries?.[0]) {
      const e = result.entries[0]
      return this.toCandidate(e, e.webpage_url ?? e.url ?? sourceArg)
    }
    if (result.id || result.webpage_url) {
      return this.toCandidate(result, result.webpage_url ?? result.url ?? sourceArg)
    }
    return null
  }

  /** Stage 1: free-text search returns catalog hits (real songs, not videos). */
  async search(text: string): Promise<CatalogTrack[]> {
    return searchCatalog(text)
  }

  /**
   * Stage 2: convert a catalog hit into a play-ready TrackCandidate by finding a duration-matched
   * audio source on YouTube. The candidate's display metadata is taken from the catalog (canonical),
   * and only the source URL/id come from YouTube.
   */
  async resolveCatalog(track: CatalogTrack): Promise<TrackCandidate> {
    const cacheKey = catalogCacheKey(track)
    const inflight = this.inFlightCatalog.get(cacheKey)
    if (inflight) return inflight

    const cached = this.cache.getFresh(cacheKey)
    if (cached?.candidate) {
      return cached.candidate
    }

    const promise = this.matchCatalogToYoutube(track, cacheKey).finally(() => {
      this.inFlightCatalog.delete(cacheKey)
    })
    this.inFlightCatalog.set(cacheKey, promise)
    return promise
  }

  private async matchCatalogToYoutube(
    track: CatalogTrack,
    cacheKey: string
  ): Promise<TrackCandidate> {
    const query = `${track.artist} ${track.title}`.trim()
    const sourceArg = buildYtsearchArg(query, STAGE2_SEARCH_LIMIT)
    const result = await this.runYtdlp(
      ["--dump-single-json", "--flat-playlist", "--no-warnings", sourceArg],
      this.settings.get().resolverTimeoutMs
    )
    const entries = (Array.isArray(result.entries) ? result.entries : []) as MatcherEntry[]
    const best = pickBestMatch(entries, track)
    if (!best) {
      throw new Error(`Couldn't find a clean audio source for "${track.title}" by ${track.artist}.`)
    }

    const candidate = this.fromMatchedEntry(best.entry, track)
    const expiresAt = this.metadataExpiresAt()
    this.cache.setResolved(cacheKey, {
      candidate,
      streamUrl: null,
      expiresAt,
      streamExpiresAt: null,
    })
    this.cache.setResolved(candidate.sourceUrl, {
      candidate,
      streamUrl: null,
      expiresAt,
      streamExpiresAt: null,
    })
    // Pre-fire stream URL fetch in parallel with the renderer round-trip so that, by the time
    // the user's queue.add({playNow:true}) call comes back through resolve(), the stream URL is
    // (often) already cached — turning two sequential yt-dlp calls into one perceived call.
    void this.fillStreamUrl(candidate.sourceUrl, candidate).catch(() => {
      // failure is non-fatal — resolve() will retry through the normal cache-miss path
    })
    return candidate
  }

  private fromMatchedEntry(entry: MatcherEntry, track: CatalogTrack): TrackCandidate {
    const ytEntry: YtdlpEntry = {
      id: entry.id,
      title: entry.title,
      uploader: entry.uploader,
      duration: entry.duration,
      webpage_url: entry.webpage_url,
      url: entry.url,
      view_count: entry.view_count,
    }
    const ytCandidate = this.toCandidate(ytEntry, entry.webpage_url ?? entry.url ?? "")
    return {
      ...ytCandidate,
      title: track.title,
      artist: track.artist,
      durationMs: track.durationMs,
      thumbnailUrl: track.artworkUrl ?? ytCandidate.thumbnailUrl,
    }
  }

  async listPlaylist(inputUrl: string): Promise<TrackCandidate[]> {
    return (await this.listPlaylistWithMetadata(inputUrl, this.settings.get().importMaxTracks))
      .tracks
  }

  async listPlaylistWithMetadata(
    inputUrl: string,
    maxTracks = this.settings.get().importMaxTracks
  ): Promise<PlaylistResolution> {
    const result = await this.runYtdlp(
      ["--dump-single-json", "--flat-playlist", "--no-warnings", inputUrl.trim()],
      this.settings.get().resolverTimeoutMs
    )
    const entries = Array.isArray(result.entries) ? result.entries : []
    const sourceTrackCount = entries.length
    const limited = entries.slice(0, maxTracks)
    const settings = this.settings.get()
    const tracks = limited.map((entry) =>
      this.toCandidate(entry, entry.webpage_url ?? entry.url ?? inputUrl)
    )
    if (settings.metadataEnrichmentEnabled) {
      // Enrich in the background — the renderer/import pipeline gets raw candidates immediately
      // and the cache + library are updated when each enrichment lands.
      for (const candidate of tracks) {
        this.enrichInBackground(candidate.sourceUrl, candidate, null)
      }
    }
    return {
      title: result.title?.trim() || "Imported Playlist",
      tracks,
      truncated: sourceTrackCount > maxTracks,
      sourceTrackCount,
    }
  }

  toCandidate(entry: YtdlpEntry, fallbackUrl: string): TrackCandidate {
    const extractor = entry.extractor_key ?? null
    const provider = providerFromExtractor(extractor, entry.webpage_url ?? entry.url ?? fallbackUrl)
    const canonicalUrl =
      entry.webpage_url ??
      entry.original_url ??
      normalizeSourceUrl(provider, entry.url, entry.id) ??
      fallbackUrl
    return {
      title: entry.title ?? "Untitled track",
      artist: entry.artist ?? entry.uploader ?? null,
      durationMs: typeof entry.duration === "number" ? Math.round(entry.duration * 1000) : null,
      thumbnailUrl: entry.thumbnail ?? thumbnailFromProvider(provider, entry.id ?? null),
      sourceUrl: canonicalUrl,
      canonicalUrl,
      provider,
      sourceId: entry.id ?? null,
      extractor,
    }
  }

  private runYtdlp(args: string[], timeoutMs: number): Promise<YtdlpEntry> {
    const settings = this.settings.get()
    const ytdlpPath = resolveYtdlpPath(settings.ytdlpPath)
    return new Promise((resolve, reject) => {
      const child = spawn(ytdlpPath, args, { stdio: ["ignore", "pipe", "pipe"] })
      let stdout = ""
      let stderr = ""
      const timeout = setTimeout(() => {
        child.kill("SIGTERM")
        reject(new Error(`Resolver timed out after ${timeoutMs}ms.`))
      }, timeoutMs)

      child.stdout.setEncoding("utf8")
      child.stderr.setEncoding("utf8")
      child.stdout.on("data", (chunk) => {
        stdout += chunk
      })
      child.stderr.on("data", (chunk) => {
        stderr += chunk
      })
      child.on("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timeout)
        if (error.code === "ENOENT") {
          reject(new Error(`Could not find yt-dlp at "${ytdlpPath}". Update the path in Settings.`))
          return
        }
        reject(error)
      })
      child.on("close", (code) => {
        clearTimeout(timeout)
        if (code !== 0) {
          reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}.`))
          return
        }
        try {
          resolve(JSON.parse(stdout) as YtdlpEntry)
        } catch {
          reject(new Error("yt-dlp returned invalid JSON."))
        }
      })
    })
  }
}

function providerFromExtractor(extractor: string | null, url: string): Provider {
  const value = `${extractor ?? ""} ${url}`.toLowerCase()
  if (value.includes("youtube") || value.includes("youtu.be")) return "youtube"
  if (value.includes("soundcloud")) return "soundcloud"
  if (value.includes("bandcamp")) return "bandcamp"
  if (/^https?:\/\/.+\.(mp3|flac|wav|m4a|ogg)(\?.*)?$/i.test(url)) return "direct"
  return "unknown"
}

function thumbnailFromProvider(provider: Provider, sourceId: string | null): string | null {
  if (provider !== "youtube" || !sourceId || !/^[\w-]{11}$/.test(sourceId)) {
    return null
  }

  return `https://i.ytimg.com/vi/${sourceId}/hqdefault.jpg`
}

function normalizeSourceUrl(
  provider: Provider,
  rawUrl: string | undefined,
  sourceId: string | undefined
): string | null {
  const trimmed = rawUrl?.trim()
  if (trimmed) {
    if (/^https?:\/\//i.test(trimmed)) return trimmed
    if (provider === "youtube") {
      const id = extractYoutubeId(trimmed) ?? sourceId ?? null
      if (id) return `https://www.youtube.com/watch?v=${id}`
    }
  }

  if (provider === "youtube" && sourceId && /^[\w-]{11}$/.test(sourceId)) {
    return `https://www.youtube.com/watch?v=${sourceId}`
  }

  return null
}

function extractYoutubeId(value: string): string | null {
  const trimmed = value.trim()
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed
  const watchMatch = /(?:v=|\/)([\w-]{11})(?:[?&/]|$)/.exec(trimmed)
  return watchMatch?.[1] ?? null
}

function catalogCacheKey(track: CatalogTrack): string {
  return `catalog:${track.catalogProvider}:${track.catalogId}`
}

/**
 * YouTube googlevideo URLs embed a unix-second `expire=` parameter that reflects the actual
 * stream URL lifetime (typically ~6h). Returning that as ms-since-epoch lets the cache keep
 * stream URLs fresh for as long as YouTube allows, instead of always falling back to the much
 * shorter configured TTL. Returns null when no expiry is detectable.
 */
function parseStreamExpiryMs(streamUrl: string): number | null {
  try {
    const url = new URL(streamUrl)
    const expire = url.searchParams.get("expire")
    if (!expire) return null
    const seconds = Number.parseInt(expire, 10)
    if (!Number.isFinite(seconds) || seconds <= 0) return null
    return seconds * 1000
  } catch {
    return null
  }
}
