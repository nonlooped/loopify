import type { SpotifyUrlInfo } from "spotify-url-info"
import * as spotifyUrlInfoModule from "spotify-url-info"
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

function readPlaylistTitle(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined
  const c = payload as {
    title?: unknown
    name?: unknown
    playlist?: { name?: unknown }
  }
  if (typeof c.title === "string" && c.title.trim()) return c.title.trim()
  if (typeof c.name === "string" && c.name.trim()) return c.name.trim()
  const n = c.playlist?.name
  if (typeof n === "string" && n.trim()) return n.trim()
  return undefined
}

function extractSpotifyTrackCount(value: unknown): number {
  if (!value || typeof value !== "object") return 0
  const c = value as { trackCount?: unknown; tracks?: { total?: unknown } }
  if (typeof c.trackCount === "number" && Number.isFinite(c.trackCount) && c.trackCount > 0) {
    return Math.floor(c.trackCount)
  }
  const t = c.tracks?.total
  if (typeof t === "number" && Number.isFinite(t) && t > 0) return Math.floor(t)
  return 0
}

function toSpotifyRow(value: unknown): SpotifyRow | null {
  if (!value || typeof value !== "object") return null
  const e = value as {
    name?: unknown
    title?: unknown
    artist?: unknown
    artists?: unknown
    duration_ms?: unknown
    duration?: unknown
  }
  const title =
    (typeof e.name === "string" && e.name.trim()) || (typeof e.title === "string" && e.title.trim())
  if (!title) return null
  let artist: string | undefined
  if (typeof e.artist === "string" && e.artist.trim()) {
    artist = e.artist.trim()
  } else if (Array.isArray(e.artists)) {
    const names = e.artists
      .map((a) => {
        if (typeof a === "string") return a.trim()
        if (
          a &&
          typeof a === "object" &&
          "name" in a &&
          typeof (a as { name: unknown }).name === "string"
        ) {
          return (a as { name: string }).name.trim()
        }
        return ""
      })
      .filter(Boolean)
    if (names.length) artist = names.join(", ")
  }
  const durationMs = normalizeDurationMs(e.duration_ms ?? e.duration)
  return { title, artist, durationMs }
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
    const throttle = Math.max(1, this.settings.get().importProgressThrottle)
    let j: ImportJob = {
      ...job,
      total: candidates.length,
      completed: 0,
      failed: 0,
      phase: "saving",
    }
    let saved = 0
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i]
      try {
        this.resolver.primeCandidate(candidate)
        const track = this.library.upsertTrack(candidate)
        this.library.addTrackToPlaylistRecord(targetPlaylistId, track.id, candidate.sourceUrl)
        saved += 1
        j = this.update(j, {
          completed: saved,
          phase: "saving",
          status: "running",
        })
        if (saved % throttle === 0 || i === candidates.length - 1) {
          this.onJobUpdated(j)
        }
      } catch {
        j = this.update(j, { failed: j.failed + 1 })
      }
    }
    this.update(j, {
      status: "done",
      phase: "done",
      completed: saved,
      finishedAt: Date.now(),
      playlistTitle: playlistTitle ?? j.playlistTitle,
    })
  }
}
