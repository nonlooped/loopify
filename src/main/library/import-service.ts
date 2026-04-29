import type { SpotifyUrlInfo } from "spotify-url-info"
import * as spotifyUrlInfoModule from "spotify-url-info"
import { z } from "zod"
import {
  type ImportJob,
  type ImportSourceKind,
  isSystemPlaylistId,
  type TrackCandidate,
} from "../../shared/types/music"
import type { ImportRepository, LibraryRepository, SettingsRepository } from "../db/repositories"
import type { PlaylistResolution, ResolverService } from "../resolver/resolver-service"
import { detectImportSource } from "./playlist-source"
import { matchAllSpotifyRows, type SpotifyRow } from "./spotify-import-matching"

const SPOTIFY_UA = {
  "User-Agent": "Loopify/1.0 (desktop; +https://github.com/unloopedmido/loopify)",
}

const spotify = (
  spotifyUrlInfoModule as unknown as { default: (f: typeof fetch) => SpotifyUrlInfo }
).default(globalThis.fetch)

const SpotifyPlaylistPayloadSchema = z
  .object({
    title: z.string().optional(),
    name: z.string().optional(),
    playlist: z.object({ name: z.string().optional() }).optional(),
  })
  .passthrough()

const SpotifyTrackCountSchema = z
  .object({
    trackCount: z.number().positive().optional(),
    tracks: z.object({ total: z.number().positive().optional() }).optional(),
  })
  .passthrough()

const SpotifyTrackItemSchema = z
  .object({
    name: z.string().optional(),
    title: z.string().optional(),
    artist: z.string().optional(),
    artists: z
      .array(z.union([z.string(), z.object({ name: z.string() }) as z.ZodType<{ name: string }>]))
      .optional(),
    duration_ms: z.number().optional(),
    duration: z.number().optional(),
  })
  .passthrough()

function readPlaylistTitle(payload: unknown): string | undefined {
  const result = SpotifyPlaylistPayloadSchema.safeParse(payload)
  if (!result.success) return undefined
  const { title, name, playlist } = result.data
  return title?.trim() || name?.trim() || playlist?.name?.trim() || undefined
}

function extractSpotifyTrackCount(value: unknown): number {
  const result = SpotifyTrackCountSchema.safeParse(value)
  if (!result.success) return 0
  return Math.floor(result.data.trackCount ?? result.data.tracks?.total ?? 0)
}

function toSpotifyRow(value: unknown): SpotifyRow | null {
  const result = SpotifyTrackItemSchema.safeParse(value)
  if (!result.success) return null
  const { name, title, artist, artists, duration_ms, duration } = result.data
  const trackTitle = (name ?? title ?? "").trim()
  if (!trackTitle) return null
  let trackArtist: string | undefined
  if (artist?.trim()) {
    trackArtist = artist.trim()
  } else if (artists?.length) {
    const names = artists
      .map((a) => (typeof a === "string" ? a.trim() : a.name.trim()))
      .filter(Boolean)
    if (names.length) trackArtist = names.join(", ")
  }
  return {
    title: trackTitle,
    artist: trackArtist,
    durationMs: normalizeDurationMs(duration_ms ?? duration),
  }
}

function normalizeDurationMs(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return undefined
  if (v < 1000) return Math.floor(v * 1000)
  return Math.floor(v)
}

function uniqueBySource<T extends { sourceUrl: string }>(candidates: T[]): T[] {
  const seen = new Set<string>()
  return candidates.filter((c) => {
    if (seen.has(c.sourceUrl)) return false
    seen.add(c.sourceUrl)
    return true
  })
}

export class ImportService {
  constructor(
    private readonly imports: ImportRepository,
    private readonly library: LibraryRepository,
    private readonly resolver: ResolverService,
    private readonly settings: SettingsRepository,
    private readonly onJobUpdated: (job: ImportJob) => void = () => {}
  ) {}

  start(inputUrl: string, targetPlaylistId: string | null): ImportJob {
    if (targetPlaylistId && isSystemPlaylistId(targetPlaylistId)) {
      throw new Error(
        "Cannot import into a system playlist. Create or pick a regular playlist, or start an import without a target so Loopify can create one."
      )
    }
    const job = this.imports.create(inputUrl, targetPlaylistId)
    this.onJobUpdated(job)
    void this.run(job)
    return job
  }

  getStatus(importId: string): ImportJob | null {
    return this.imports.get(importId)
  }

  private emit(current: ImportJob): ImportJob {
    this.onJobUpdated(current)
    return current
  }

  private update(dbJob: ImportJob, patch: Partial<ImportJob>): ImportJob {
    const next = this.imports.update({ ...dbJob, ...patch })
    return this.emit(next)
  }

  private async run(initial: ImportJob): Promise<void> {
    let job = this.update(initial, { status: "running", phase: "fetching" })
    const settings = this.settings.get()
    try {
      const source = detectImportSource(job.inputUrl)
      const kind: ImportSourceKind = source.kind
      job = this.update(job, { sourceKind: kind })

      if (source.kind === "youtube") {
        await this.runYouTube(job, source.normalizedUrl, settings.importMaxTracks)
        return
      }
      if (source.kind === "spotify") {
        await this.runSpotify(job, source.normalizedUrl, settings)
        return
      }
      throw new Error("Unsupported import source.")
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong while importing this playlist."
      this.update(job, {
        status: "failed",
        phase: "failed",
        failed: job.failed + 1,
        finishedAt: Date.now(),
        errorMessage: message,
      })
    }
  }

  private async runYouTube(job: ImportJob, url: string, importMax: number): Promise<void> {
    const playlist: PlaylistResolution = await this.resolver.listPlaylistWithMetadata(
      url,
      importMax
    )
    const list = uniqueBySource(playlist.tracks)
    const targetPlaylistId =
      job.targetPlaylistId ?? this.library.createPlaylistRecord(playlist.title).id
    const j = this.update(job, {
      targetPlaylistId,
      playlistTitle: playlist.title,
      phase: "saving",
      sourceTrackCount: playlist.sourceTrackCount,
      total: list.length,
      matched: list.length,
      skipped: 0,
      completed: 0,
      failed: 0,
      truncated: playlist.truncated,
    })
    const plId = j.targetPlaylistId
    if (!plId) throw new Error("Import target playlist was not set.")
    await this.saveCandidates(j, list, plId, j.playlistTitle ?? undefined)
  }

  private async runSpotify(
    job: ImportJob,
    url: string,
    settings: ReturnType<SettingsRepository["get"]>
  ): Promise<void> {
    const [data, rawTracks] = await Promise.all([
      spotify.getData(url, { headers: SPOTIFY_UA }) as Promise<unknown>,
      spotify.getTracks(url, { headers: SPOTIFY_UA }) as Promise<unknown[]>,
    ])
    const title = readPlaylistTitle(data) ?? "Imported Spotify Playlist"
    const rows = (rawTracks ?? [])
      .map((t) => toSpotifyRow(t))
      .filter((r): r is SpotifyRow => Boolean(r))
    if (!rows.length) {
      throw new Error("No public tracks were found in that Spotify playlist.")
    }
    const cap = settings.importMaxTracks
    const truncated = rows.length > cap
    const limited = rows.slice(0, cap)
    const targetPlaylistId = job.targetPlaylistId ?? this.library.createPlaylistRecord(title).id
    const sourceCount = Math.max(limited.length, extractSpotifyTrackCount(data), rows.length)
    let j = this.update(job, {
      targetPlaylistId,
      playlistTitle: title,
      phase: "matching",
      sourceTrackCount: sourceCount,
      total: limited.length,
      matched: 0,
      skipped: 0,
      truncated,
    })
    const throttle = Math.max(1, settings.importProgressThrottle)
    const candidates = await matchAllSpotifyRows(
      this.resolver,
      limited,
      settings.importMatchConcurrency,
      settings.spotifyMatchScoreThreshold,
      (p) => {
        j = this.update(j, {
          matched: p.matched,
          skipped: p.skipped,
          completed: p.processed,
        })
        if (p.processed % throttle === 0 || p.processed === limited.length) {
          this.onJobUpdated(j)
        }
      },
      {
        enrichmentEnabled: settings.metadataEnrichmentEnabled,
        minScore: settings.metadataMinScore,
      }
    )
    if (!candidates.length) {
      throw new Error("Could not match any tracks from this playlist to YouTube or SoundCloud.")
    }
    j = this.update(j, {
      phase: "saving",
      total: candidates.length,
      completed: 0,
      failed: 0,
    })
    const plId = j.targetPlaylistId
    if (!plId) throw new Error("Import target playlist was not set.")
    await this.saveCandidates(j, uniqueBySource(candidates), plId, j.playlistTitle ?? undefined)
  }

  private async saveCandidates(
    job: ImportJob,
    candidates: TrackCandidate[],
    targetPlaylistId: string,
    playlistTitle: string | undefined
  ): Promise<void> {
    let j: ImportJob = {
      ...job,
      total: candidates.length,
      completed: 0,
      failed: 0,
      phase: "saving",
    }
    const result = this.library.saveCandidatesBatch(candidates, targetPlaylistId, (c) =>
      this.resolver.primeCandidate(c)
    )
    const saved = result.saved
    const failed = result.failed
    j = this.update(j, {
      completed: saved,
      failed,
      phase: "saving",
      status: "running",
    })
    this.update(j, {
      status: "done",
      phase: "done",
      completed: saved,
      finishedAt: Date.now(),
      playlistTitle: playlistTitle ?? j.playlistTitle,
    })
  }
}
