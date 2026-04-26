import { spawn } from "node:child_process"
import type { Provider, ResolvedTrack, TrackCandidate } from "../../shared/types/music"
import type { ResolverCacheRepository, SettingsRepository } from "../db/repositories"
import { enrichTrackCandidate } from "../metadata/catalog-enrichment"
import { buildYtsearchArg } from "../music/query-builders"

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

export class ResolverService {
  private readonly inFlight = new Map<string, Promise<ResolvedTrack>>()
  private readonly inFlightStream = new Map<string, Promise<string | null>>()

  constructor(
    private readonly settings: SettingsRepository,
    private readonly cache: ResolverCacheRepository
  ) {}

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
    const candidate = settings.metadataEnrichmentEnabled
      ? await enrichTrackCandidate(base, { minScore: settings.metadataMinScore })
      : base
    const streamUrl = result.url ?? null
    const expiresAt = this.metadataExpiresAt()
    this.cache.setResolved(source, {
      candidate,
      streamUrl,
      expiresAt,
      streamExpiresAt: this.streamExpiresAt(),
    })
    return {
      candidate,
      streamUrl,
      expiresAt,
    }
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
          streamExpiresAt: this.streamExpiresAt(),
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
    return Date.now() + this.settings.get().cacheTtlHours * 60 * 60 * 1000
  }

  private streamExpiresAt(): number {
    return Date.now() + this.settings.get().streamCacheTtlMinutes * 60 * 1000
  }

  /**
   * First search hit (ytsearchN / scsearchN or URL).
   * Used for Spotify import matching and command palette.
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

  async search(text: string): Promise<TrackCandidate[]> {
    const query = text.trim()
    if (!query) {
      return []
    }

    const source = buildYtsearchArg(query, 10)
    const result = await this.runYtdlp(
      ["--dump-single-json", "--flat-playlist", "--no-warnings", source],
      this.settings.get().resolverTimeoutMs
    )
    const entries = Array.isArray(result.entries) ? result.entries : []
    const candidates = entries
      .sort((left, right) => scoreSearchEntry(right, query) - scoreSearchEntry(left, query))
      .map((entry) => this.toCandidate(entry, entry.webpage_url ?? entry.url ?? query))
      .filter((candidate) => candidate.provider === "youtube")

    for (const candidate of candidates) {
      this.primeCandidate(candidate)
    }

    return candidates
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
    const tracks = await Promise.all(
      limited.map(async (entry) => {
        const c = this.toCandidate(entry, entry.webpage_url ?? entry.url ?? inputUrl)
        if (settings.metadataEnrichmentEnabled) {
          return enrichTrackCandidate(c, { minScore: settings.metadataMinScore })
        }
        return c
      })
    )
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
    return new Promise((resolve, reject) => {
      const child = spawn(settings.ytdlpPath, args, { stdio: ["ignore", "pipe", "pipe"] })
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
          reject(
            new Error(
              `Could not find yt-dlp at "${settings.ytdlpPath}". Update the path in Settings.`
            )
          )
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

function scoreSearchEntry(entry: YtdlpEntry, rawQuery: string): number {
  const query = rawQuery.trim().toLowerCase()
  const title = (entry.title ?? "").toLowerCase()
  const artist = (entry.artist ?? "").toLowerCase()
  const uploader = (entry.uploader ?? "").toLowerCase()
  const haystack = `${title} ${artist} ${uploader}`.trim()
  const queryTokens = tokenizeSearchText(query)

  let score = 0

  if (!haystack) return score
  if (query && title.includes(query)) score += 20

  const titleTokens = new Set(tokenizeSearchText(title))
  const artistTokens = new Set(tokenizeSearchText(artist))
  const uploaderTokens = new Set(tokenizeSearchText(uploader))

  let matchedTitleTokens = 0
  let matchedArtistTokens = 0
  let matchedUploaderTokens = 0

  for (const token of queryTokens) {
    if (titleTokens.has(token)) matchedTitleTokens += 1
    if (artistTokens.has(token)) matchedArtistTokens += 1
    if (uploaderTokens.has(token)) matchedUploaderTokens += 1
  }

  score += matchedTitleTokens * 8
  score += matchedArtistTokens * 10
  score += matchedUploaderTokens * 5

  if (queryTokens.length > 0) {
    const covered = new Set([
      ...queryTokens.filter((token) => titleTokens.has(token) || artistTokens.has(token)),
    ]).size
    score += (covered / queryTokens.length) * 18
  }

  if (isLikelyOfficialAudio(title, uploader)) score += 18
  if (isLikelyOfficialChannel(artist, uploader, queryTokens)) score += 16
  if (title.includes("official music video")) score += 6
  if (title.includes("official video")) score += 4

  score -= noisePenalty(title, uploader)
  score += durationScore(entry.duration)

  return score
}

function tokenizeSearchText(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function isLikelyOfficialAudio(title: string, uploader: string): boolean {
  return (
    title.includes("official audio") ||
    title.includes("[official audio]") ||
    title.includes("(official audio)") ||
    uploader.endsWith(" - topic") ||
    uploader.includes("vevo")
  )
}

function isLikelyOfficialChannel(artist: string, uploader: string, queryTokens: string[]): boolean {
  if (uploader.endsWith(" - topic") || uploader.includes("vevo")) return true
  if (!uploader) return false

  const uploaderTokens = new Set(tokenizeSearchText(uploader))
  const artistTokens = tokenizeSearchText(artist)
  if (artistTokens.length > 0 && artistTokens.every((token) => uploaderTokens.has(token))) {
    return true
  }

  const matchedQueryTokens = queryTokens.filter((token) => uploaderTokens.has(token)).length
  return matchedQueryTokens >= Math.min(2, queryTokens.length)
}

function noisePenalty(title: string, uploader: string): number {
  const text = `${title} ${uploader}`
  let penalty = 0

  const strongNegativeTerms = [
    "lyrics",
    "lyric video",
    "sped up",
    "slowed",
    "nightcore",
    "remix",
    "cover",
    "reaction",
    "live",
    "concert",
    "karaoke",
    "instrumental",
    "8d",
    "amv",
    "edit",
    "fan made",
    "fanmade",
    "clip",
    "shorts",
    "fast verse",
    "bass boosted",
    "reverb",
    "mashup",
  ]
  const softNegativeTerms = ["official music video", "official video", "visualizer", "animated"]

  for (const term of strongNegativeTerms) {
    if (text.includes(term)) penalty += 14
  }
  for (const term of softNegativeTerms) {
    if (text.includes(term)) penalty += 4
  }

  return penalty
}

function durationScore(durationSeconds: number | undefined): number {
  if (typeof durationSeconds !== "number" || Number.isNaN(durationSeconds)) return 0
  if (durationSeconds < 90) return -18
  if (durationSeconds < 150) return -8
  if (durationSeconds <= 420) return 6
  if (durationSeconds <= 540) return 2
  return -6
}
