import { type ChildProcessByStdio, spawn } from "node:child_process"
import { EventEmitter } from "node:events"
import { createConnection, type Socket } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Readable } from "node:stream"
import type { PlayerState, PlayerTrack, RepeatMode, Track } from "../../shared/types/music"
import type { SettingsRepository } from "../db/repositories"
import { resolveMpvPath } from "./mpv-binary"

const STATE_EMIT_THROTTLE_MS = 200

export class PlayerService extends EventEmitter {
  private process: ChildProcessByStdio<null, Readable, Readable> | null = null
  private socket: Socket | null = null
  private ipcPath = createMpvIpcPath()
  private state: PlayerState
  private requestId = 0
  private pendingCommands = new Map<
    number,
    { resolve: () => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >()
  private lastEmitAt = 0
  private emitTimer: NodeJS.Timeout | null = null

  constructor(private readonly settings: SettingsRepository) {
    super()
    this.state = {
      status: "idle",
      queueItemId: null,
      title: null,
      track: null,
      positionSeconds: 0,
      durationSeconds: null,
      volume: this.settings.get().playbackVolume,
      repeatMode: "off",
      error: null,
    }
  }

  getState(): PlayerState {
    return { ...this.state }
  }

  async play(streamUrl: string, queueItemId: string, track: Track): Promise<PlayerState> {
    await this.ensureProcess()
    this.state = {
      ...this.state,
      status: "loading",
      queueItemId,
      title: track.title,
      track: mapPlayerTrack(track),
      positionSeconds: 0,
      durationSeconds: null,
      error: null,
    }
    this.emitState()
    await this.command(["loadfile", streamUrl, "replace"])
    await this.command(["set_property", "pause", false])
    this.state = { ...this.state, status: "playing" }
    this.emitState()
    return this.getState()
  }

  async pause(): Promise<PlayerState> {
    await this.command(["set_property", "pause", true])
    this.state = { ...this.state, status: "paused" }
    this.emitState()
    return this.getState()
  }

  async resume(): Promise<PlayerState> {
    await this.command(["set_property", "pause", false])
    this.state = { ...this.state, status: "playing" }
    this.emitState()
    return this.getState()
  }

  async stop(): Promise<PlayerState> {
    if (this.socket) {
      await this.command(["stop"])
    }
    this.state = {
      ...this.state,
      status: "idle",
      queueItemId: null,
      title: null,
      track: null,
      positionSeconds: 0,
      durationSeconds: null,
      error: null,
    }
    this.emitState()
    return this.getState()
  }

  /** When mpv stops after a natural end-of-file and there is no next track, clear now-playing. */
  clearNowPlayingAfterTrackEnded(): void {
    if (this.state.status !== "idle") {
      return
    }
    this.state = {
      ...this.state,
      queueItemId: null,
      title: null,
      track: null,
    }
    this.emitState()
  }

  async seek(seconds: number): Promise<PlayerState> {
    await this.command(["seek", seconds, "absolute+exact"])
    this.state = { ...this.state, positionSeconds: seconds }
    this.emitState()
    return this.getState()
  }

  async setVolume(volume: number): Promise<PlayerState> {
    const next = Math.max(0, Math.min(100, Math.round(volume)))
    await this.command(["set_property", "volume", next])
    this.settings.update({ playbackVolume: next })
    this.state = { ...this.state, volume: next }
    this.emitState()
    return this.getState()
  }

  setRepeatMode(mode: RepeatMode): PlayerState {
    this.state = { ...this.state, repeatMode: mode }
    this.emitState()
    return this.getState()
  }

  shutdown(): void {
    if (this.socket && !this.socket.destroyed) {
      this.socket.write(`${JSON.stringify({ command: ["quit"] })}\n`)
    }
    this.socket?.destroy()
    this.process?.kill()
    this.socket = null
    this.process = null
  }

  private async ensureProcess(): Promise<void> {
    if (this.process && this.socket && !this.socket.destroyed) {
      return
    }

    const settings = this.settings.get()
    const mpvPath = resolveMpvPath(settings.mpvPath)
    const mpvProcess = spawn(
      mpvPath,
      ["--idle=yes", "--force-window=no", "--terminal=no", `--input-ipc-server=${this.ipcPath}`],
      {
        stdio: ["ignore", "pipe", "pipe"],
      }
    )
    this.process = mpvProcess

    const handleStartupError = (error: NodeJS.ErrnoException): Error => {
      return new Error(
        error.code === "ENOENT"
          ? `Could not find mpv at "${mpvPath}". Set LOOPIFY_MPV_PATH, bundle mpv in resources/binaries, or update the path in Settings.`
          : error.message
      )
    }

    mpvProcess.on("error", (error: NodeJS.ErrnoException) => {
      this.state = {
        ...this.state,
        status: "errored",
        error: handleStartupError(error).message,
      }
      this.emitState()
    })
    mpvProcess.on("exit", () => {
      if (this.process !== mpvProcess) {
        return
      }
      this.socket?.destroy()
      this.socket = null
      this.process = null
      if (this.state.status !== "idle") {
        this.state = { ...this.state, status: "idle" }
        this.emitState()
      }
    })

    const startupFailure = new Promise<never>((_, reject) => {
      mpvProcess.once("error", (error: NodeJS.ErrnoException) => reject(handleStartupError(error)))
      mpvProcess.once("exit", (code, signal) => {
        reject(
          new Error(
            `mpv exited before IPC was ready${code === null ? "" : ` with code ${code}`}${signal ? ` (${signal})` : ""}.`
          )
        )
      })
    })

    try {
      this.socket = await Promise.race([waitForSocket(this.ipcPath), startupFailure])
      this.socket.setEncoding("utf8")
      this.socket.on("data", (chunk) => this.handleMpvOutput(String(chunk)))
      await this.command(["observe_property", 1, "time-pos"])
      await this.command(["observe_property", 2, "duration"])
      await this.command(["observe_property", 3, "pause"])
      await this.setVolume(this.state.volume)
    } catch (error) {
      if (this.process === mpvProcess) {
        this.socket?.destroy()
        this.socket = null
        this.process = null
      }
      if (!mpvProcess.killed) {
        mpvProcess.kill()
      }
      this.state = {
        ...this.state,
        status: "errored",
        error: error instanceof Error ? error.message : "Could not start mpv.",
      }
      this.emitState()
      throw error
    }
  }

  private handleMpvOutput(chunk: string): void {
    for (const line of chunk.split("\n")) {
      if (!line.trim()) continue
      try {
        const message = JSON.parse(line) as {
          event?: string
          name?: string
          data?: unknown
          reason?: string
          request_id?: number
          error?: string
        }

        if (typeof message.request_id === "number") {
          const pending = this.pendingCommands.get(message.request_id)
          if (pending) {
            clearTimeout(pending.timer)
            this.pendingCommands.delete(message.request_id)
            if (message.error && message.error !== "success") {
              pending.reject(new Error(`mpv command failed: ${message.error}`))
            } else {
              pending.resolve()
            }
          }
          continue
        }

        if (
          message.event === "property-change" &&
          message.name === "time-pos" &&
          typeof message.data === "number"
        ) {
          this.state = { ...this.state, positionSeconds: message.data }
          this.scheduleThrottledEmit()
          continue
        }
        if (
          message.event === "property-change" &&
          message.name === "duration" &&
          typeof message.data === "number"
        ) {
          this.state = { ...this.state, durationSeconds: message.data }
          this.scheduleThrottledEmit()
          continue
        }
        if (
          message.event === "property-change" &&
          message.name === "pause" &&
          typeof message.data === "boolean"
        ) {
          if (message.data && this.state.status === "playing") {
            this.state = { ...this.state, status: "paused" }
            this.scheduleThrottledEmit()
          }
          if (!message.data && this.state.status === "paused") {
            this.state = { ...this.state, status: "playing" }
            this.scheduleThrottledEmit()
          }
          continue
        }
        if (message.event === "end-file") {
          if (message.reason === "eof") {
            this.state = { ...this.state, status: "idle", positionSeconds: 0 }
            this.emitState()
          }
          if (message.reason === "error") {
            this.state = {
              ...this.state,
              status: "errored",
              error: "mpv could not play this file.",
            }
            this.emitState()
          }
        }
      } catch {
        // ignore non-JSON lines (mpv logs, warnings)
      }
    }
  }

  private scheduleThrottledEmit(): void {
    const now = Date.now()
    if (now - this.lastEmitAt >= STATE_EMIT_THROTTLE_MS) {
      this.lastEmitAt = now
      if (this.emitTimer) {
        clearTimeout(this.emitTimer)
        this.emitTimer = null
      }
      this.emitState()
      return
    }
    if (!this.emitTimer) {
      this.emitTimer = setTimeout(
        () => {
          this.emitTimer = null
          this.lastEmitAt = Date.now()
          this.emitState()
        },
        STATE_EMIT_THROTTLE_MS - (now - this.lastEmitAt)
      )
    }
  }

  private command(command: unknown[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new Error("mpv is not connected."))
        return
      }
      const requestId = ++this.requestId
      const timer = setTimeout(() => {
        this.pendingCommands.delete(requestId)
        reject(new Error("mpv command timed out."))
      }, 5000)
      this.pendingCommands.set(requestId, { resolve, reject, timer })
      this.socket.write(`${JSON.stringify({ command, request_id: requestId })}\n`, (error) => {
        if (error) {
          clearTimeout(timer)
          this.pendingCommands.delete(requestId)
          reject(error)
        }
      })
    })
  }

  private emitState(): void {
    this.emit("state", this.getState())
  }
}

function waitForSocket(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const connect = (): void => {
      const socket = createConnection(path)
      socket.once("connect", () => resolve(socket))
      socket.once("error", (error) => {
        socket.destroy()
        if (Date.now() - startedAt > 5000) {
          reject(error)
          return
        }
        setTimeout(connect, 100)
      })
    }
    connect()
  })
}

function createMpvIpcPath(): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\loopify-mpv-${process.pid}`
  }

  return join(tmpdir(), `loopify-mpv-${process.pid}.sock`)
}

function mapPlayerTrack(track: Track): PlayerTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    durationMs: track.durationMs,
    thumbnailUrl: track.thumbnailUrl,
    canonicalUrl: track.canonicalUrl,
    provider: track.provider,
    likedAt: track.likedAt,
    downloadStatus: track.downloadStatus,
    downloadedFilePath: track.downloadedFilePath,
  }
}
