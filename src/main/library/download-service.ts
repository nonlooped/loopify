import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs"
import { basename, join } from "node:path"
import { app } from "electron"
import { execa } from "execa"
import pLimit from "p-limit"
import type { Playlist, Track, TrackCandidate } from "../../shared/types/music"
import type { LibraryRepository, SettingsRepository } from "../db/repositories"

type DownloadEvents = {
  onTrackChanged: (track: Track) => void
}

const MAX_CONCURRENT_DOWNLOADS = 3

export class DownloadService {
  private readonly inFlight = new Set<string>()
  private readonly lastProgressTime = new Map<string, number>()
  private readonly downloadsDir = join(app.getPath("userData"), "downloads")
  private readonly limit = pLimit(MAX_CONCURRENT_DOWNLOADS)

  constructor(
    private readonly library: LibraryRepository,
    private readonly settings: SettingsRepository,
    private readonly events: DownloadEvents
  ) {
    mkdirSync(this.downloadsDir, { recursive: true })
  }

  async downloadTrack(trackId: string): Promise<Track> {
    const track = this.library.getTrack(trackId)
    if (!track) {
      throw new Error("Track was not found.")
    }
    void this.limit(() => this.start(track))
    return this.emit(this.library.setDownloadQueued(track.id))
  }

  async downloadCandidate(candidate: TrackCandidate): Promise<Track> {
    const track = this.library.upsertTrack(candidate)
    void this.limit(() => this.start(track))
    return this.emit(this.library.setDownloadQueued(track.id))
  }

  async downloadPlaylist(playlistId: string): Promise<Playlist[]> {
    const tracks = this.library.listTracksInPlaylist(playlistId)
    for (const track of tracks) {
      if (track.downloadStatus === "downloaded" || this.inFlight.has(track.id)) {
        continue
      }
      void this.limit(() => this.start(track))
    }
    return this.library.listPlaylists()
  }

  removeTrackDownload(trackId: string): Track {
    const track = this.library.getTrack(trackId)
    if (!track) {
      throw new Error("Track was not found.")
    }
    if (track.downloadedFilePath && existsSync(track.downloadedFilePath)) {
      rmSync(track.downloadedFilePath, { force: true })
    }
    return this.emit(this.library.clearDownload(trackId))
  }

  private async start(track: Track): Promise<void> {
    if (this.inFlight.has(track.id)) {
      return
    }

    this.inFlight.add(track.id)
    this.emit(this.library.setDownloadQueued(track.id))

    try {
      const filePath = await this.runYtdlp(track)
      this.emit(this.library.setDownloadComplete(track.id, filePath))
    } catch (error) {
      const message = error instanceof Error ? error.message : "Download failed."
      this.emit(this.library.setDownloadFailed(track.id, message))
    } finally {
      this.inFlight.delete(track.id)
      this.lastProgressTime.delete(track.id)
    }
  }

  private async runYtdlp(track: Track): Promise<string> {
    const outputTemplate = join(this.downloadsDir, `${track.id}.%(ext)s`)
    const settings = this.settings.get()
    const sourceUrl = this.library.findDownloadSourceUrlForTrack(track.id) ?? track.canonicalUrl
    const args = [
      "--newline",
      "--no-playlist",
      "--no-warnings",
      "--format",
      "bestaudio/best",
      "--output",
      outputTemplate,
      sourceUrl,
    ]

    try {
      const subprocess = execa(settings.ytdlpPath, args, {
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      })
      subprocess.stdout?.setEncoding("utf8")
      subprocess.stderr?.setEncoding("utf8")
      subprocess.stdout?.on("data", (chunk) => {
        this.handleProgress(track.id, String(chunk))
      })
      subprocess.stderr?.on("data", (chunk) => {
        this.handleProgress(track.id, String(chunk))
      })
      await subprocess
    } catch (error) {
      if (isErrnoException(error) && error.code === "ENOENT") {
        throw new Error(
          `Could not find yt-dlp at "${settings.ytdlpPath}". Update the path in Settings.`
        )
      }
      if (isExecaError(error) && error.failed) {
        throw new Error(error.stderr.trim() || `yt-dlp exited with code ${error.exitCode}.`)
      }
      throw error
    }

    const filePath = this.findDownloadedFile(track.id)
    if (!filePath) {
      throw new Error("Download completed, but the local file could not be found.")
    }
    return filePath
  }

  private handleProgress(trackId: string, text: string): void {
    const match = /(\d+(?:\.\d+)?)%/.exec(text)
    if (!match) return
    const progress = Math.max(1, Math.min(99, Math.round(Number(match[1]))))
    const now = Date.now()
    const lastTime = this.lastProgressTime.get(trackId) ?? 0
    if (now - lastTime < 1000) {
      return
    }
    this.lastProgressTime.set(trackId, now)
    this.emit(this.library.setDownloadProgress(trackId, progress))
  }

  private findDownloadedFile(trackId: string): string | null {
    const file = readdirSync(this.downloadsDir).find((entry) => basename(entry).startsWith(trackId))
    return file ? join(this.downloadsDir, file) : null
  }

  private emit(track: Track): Track {
    this.events.onTrackChanged(track)
    return track
  }
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error
}

function isExecaError(error: unknown): error is Error & {
  exitCode?: number
  failed?: boolean
  stderr: string
} {
  return error instanceof Error && "stderr" in error
}
