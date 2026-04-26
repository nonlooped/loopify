import { Client, type SetActivity } from "@xhayper/discord-rpc"
import type { PlayerState } from "../../shared/types/music"

export const DISCORD_APPLICATION_ID = "1340763643796783146"
const RECONNECT_DELAY_MS = 5_000

export type DiscordRpcSession = {
  connect: () => Promise<void>
  setActivity: (activity: SetActivity) => Promise<void>
  clearActivity: () => Promise<void>
  destroy: () => Promise<void>
  onDisconnected?: (listener: () => void) => void
}

type DiscordPresenceServiceOptions = {
  applicationId: string
  enabled: boolean
  createSession?: (applicationId: string) => DiscordRpcSession
  reconnectDelayMs?: number
}

export class DiscordPresenceService {
  private readonly applicationId: string
  private readonly createSession: (applicationId: string) => DiscordRpcSession
  private readonly reconnectDelayMs: number
  private enabled: boolean
  private session: DiscordRpcSession | null = null
  private connected = false
  private connectPromise: Promise<void> | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private shuttingDown = false
  private lastActivity: SetActivity | null = null
  private lastSyncedActivityKey: string | null = null

  constructor(options: DiscordPresenceServiceOptions) {
    this.applicationId = options.applicationId
    this.enabled = options.enabled
    this.createSession = options.createSession ?? createDiscordRpcSession
    this.reconnectDelayMs = options.reconnectDelayMs ?? RECONNECT_DELAY_MS
    if (this.enabled) {
      this.scheduleReconnect(0)
    }
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.lastSyncedActivityKey = null
      void this.clearAndDisconnect()
      return
    }
    // Force re-publish on next sync once re-enabled.
    this.lastSyncedActivityKey = null
    this.scheduleReconnect(0)
  }

  sync(state: PlayerState): void {
    // Avoid building activities or touching reconnect state when presence is off;
    // mpv emits player state ~4× per second and Discord RPC has a tight rate limit.
    if (!this.enabled) {
      this.lastSyncedActivityKey = null
      return
    }
    const activityKey = computeActivityKey(state)
    if (activityKey === this.lastSyncedActivityKey) {
      return
    }
    this.lastSyncedActivityKey = activityKey
    this.lastActivity = buildDiscordActivity(state)
    this.clearReconnectTimer()
    if (!this.lastActivity) {
      void this.clearActivity()
      return
    }
    void this.publish(this.lastActivity)
  }

  shutdown(): void {
    this.shuttingDown = true
    this.clearReconnectTimer()
    void this.clearAndDisconnect()
  }

  private async publish(activity: SetActivity): Promise<void> {
    try {
      const session = await this.ensureConnected()
      await session.setActivity(activity)
    } catch (error) {
      console.error("Discord presence update failed", error)
      this.scheduleReconnect()
    }
  }

  private async clearActivity(): Promise<void> {
    try {
      const session = await this.ensureConnected()
      await session.clearActivity()
    } catch {
      /* Discord unavailable; nothing to clear remotely */
    }
  }

  private async clearAndDisconnect(): Promise<void> {
    const session = this.session
    this.session = null
    this.connected = false
    this.connectPromise = null
    if (!session) {
      return
    }
    try {
      await session.clearActivity()
    } catch {
      /* Discord unavailable */
    }
    await session.destroy()
  }

  private async ensureConnected(): Promise<DiscordRpcSession> {
    if (this.session && this.connected && !this.connectPromise) {
      return this.session
    }
    if (!this.connectPromise) {
      const session = this.session ?? this.createSession(this.applicationId)
      if (!this.session) {
        this.session = session
        session.onDisconnected?.(() => {
          if (!this.enabled || this.shuttingDown) {
            return
          }
          this.connected = false
          this.connectPromise = null
          this.scheduleReconnect()
        })
      }
      this.connectPromise = session
        .connect()
        .then(() => {
          this.connected = true
        })
        .catch((error) => {
          this.connected = false
          throw error
        })
        .finally(() => {
          this.connectPromise = null
        })
    }
    await this.connectPromise
    if (!this.session) {
      throw new Error("Discord RPC session was not created.")
    }
    return this.session
  }

  private scheduleReconnect(delayMs = this.reconnectDelayMs): void {
    if (!this.enabled || this.shuttingDown || this.reconnectTimer) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.enabled || this.shuttingDown) {
        return
      }
      void this.ensureConnected()
        .then(async (session) => {
          if (this.enabled && this.lastActivity) {
            await session.setActivity(this.lastActivity)
          }
        })
        .catch(() => {
          this.scheduleReconnect()
        })
    }, delayMs)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}

export function buildDiscordActivity(state: PlayerState): SetActivity | null {
  const track = state.track
  if (!track || state.status !== "playing") {
    return null
  }

  const activity: SetActivity = {
    type: 2,
    details: track.title,
    instance: false,
    state: track.artist ?? undefined,
    statusDisplayType: 2,
  }

  if (track.thumbnailUrl) {
    activity.largeImageKey = track.thumbnailUrl
    activity.largeImageText = track.album ?? track.title
  }

  if (track.canonicalUrl) {
    activity.detailsUrl = track.canonicalUrl
  }

  if (track.canonicalUrl && track.artist) {
    const query = encodeURIComponent(`artist:${track.artist} track:${track.title}`)
    const spotifyUrl = `https://open.spotify.com/search/${query}?si`
    if (spotifyUrl.length <= 512) {
      activity.buttons = [{ label: "Search on Spotify", url: spotifyUrl }]
    }
  }

  const timestamps = buildTimestamps(state)
  if (timestamps) {
    activity.startTimestamp = timestamps.start
    activity.endTimestamp = timestamps.end
  }

  return activity
}

export function buildTimestamps(
  state: Pick<PlayerState, "status" | "positionSeconds" | "durationSeconds">
): { start: number; end: number } | null {
  if (state.status !== "playing" || state.durationSeconds == null) {
    return null
  }
  const now = Date.now()
  const positionMs = Math.max(0, Math.round(state.positionSeconds * 1000))
  const durationMs = Math.max(positionMs, Math.round(state.durationSeconds * 1000))
  return {
    start: Math.ceil(now - positionMs),
    end: Math.ceil(now + (durationMs - positionMs)),
  }
}

// Stable cache key for the meaningful presence payload. Free-running playback keeps
// the same key (Discord increments elapsed itself); seeks/track changes/pause flip it.
function computeActivityKey(state: PlayerState): string {
  if (state.status !== "playing" || !state.track) {
    return `idle:${state.status}`
  }
  const track = state.track
  const trackId = `${track.canonicalUrl ?? ""}|${track.artist ?? ""}|${track.title}`
  const duration = state.durationSeconds ?? -1
  // Implied "track start wall clock" = now - position. Free playback keeps this
  // constant (within ~1 ms); a seek shifts it by the seek delta. Bucket to 2s so
  // small clock jitter doesn't cause spurious republishes.
  const impliedStartMs = Date.now() - Math.max(0, state.positionSeconds) * 1000
  const startBucket = Math.floor(impliedStartMs / 2000)
  return `play:${trackId}|${duration}|${startBucket}`
}

function createDiscordRpcSession(applicationId: string): DiscordRpcSession {
  const client = new Client({
    clientId: applicationId,
    transport: { type: "ipc" },
  })
  return {
    connect: () => client.login(),
    setActivity: async (activity) => {
      if (!client.user) {
        throw new Error("Discord RPC user not ready.")
      }
      await client.user.setActivity(activity, process.pid)
    },
    clearActivity: async () => {
      if (!client.user) {
        return
      }
      await client.user.clearActivity(process.pid)
    },
    destroy: () => client.destroy(),
    onDisconnected: (listener) => {
      client.on("disconnected", listener)
    },
  }
}
