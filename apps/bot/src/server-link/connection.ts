import type { ServerEvent } from '@loopify/protocol'
import { serverToBotMessageSchema } from '@loopify/protocol'
import type { Guild } from 'discord.js'
import WebSocket from 'ws'

import { assertRequiredEnv } from '../config/env.js'
import type { BotClient } from '../types/commands.js'

function wsEndpoint() {
  const base = assertRequiredEnv('MUSIC_SERVER_URL').replace(/\/$/, '')
  const wsBase = base.replace(/^http/, 'ws')
  return `${wsBase}/bot`
}

export class MusicServerConnection {
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private readonly pending: string[] = []
  private eventHandlers = new Set<(ev: ServerEvent) => void>()

  constructor(private readonly client: BotClient) {}

  onServerEvent(handler: (ev: ServerEvent) => void) {
    this.eventHandlers.add(handler)
    return () => this.eventHandlers.delete(handler)
  }

  connect() {
    const url = wsEndpoint()
    const ws = new WebSocket(url)
    this.ws = ws

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'botHello',
          token: assertRequiredEnv('INTERNAL_API_TOKEN'),
        }),
      )
      // Share the slash-command manifest so the music server can expose it
      // to the web (e.g. the public /commands page). Re-sent on every
      // reconnect because the server's cache is in-memory only.
      const manifest = this.client.commandsManifest ?? []
      ws.send(
        JSON.stringify({
          type: 'commandsManifest',
          commands: manifest,
        }),
      )
      for (const p of this.pending.splice(0)) {
        ws.send(p)
      }
      // The server's VoiceMirror lives in memory and only learns about
      // members via voiceStateUpdate, which never fires for users already
      // in voice when the bot (or music server) started. Re-seed it on
      // every (re)connection so the controller can resolve who is in VC.
      this.sendAllVoiceSnapshots()
    })

    ws.on('message', (data) => {
      try {
        const raw = JSON.parse(String(data))
        const parsed = serverToBotMessageSchema.safeParse(raw)
        if (!parsed.success) {
          return
        }
        const msg = parsed.data
        if (msg.type === 'gatewaySend') {
          const guild = this.client.guilds.cache.get(msg.guildId)
          guild?.shard?.send(msg.payload as never)
          return
        }
        if (msg.type === 'serverEvent') {
          for (const h of this.eventHandlers) {
            h(msg.event)
          }
        }
      } catch {
        /* ignore */
      }
    })

    ws.on('close', () => {
      this.ws = null
      this.scheduleReconnect()
    })

    ws.on('error', () => {
      ws.close()
    })
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return
    }
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 3000)
  }

  sendRawGateway(payload: unknown) {
    const msg = JSON.stringify({
      type: 'rawGateway',
      payload,
    } satisfies { type: 'rawGateway'; payload: unknown })
    this.rawSend(msg)
  }

  sendVoiceMembership(
    guildId: string,
    userId: string,
    voiceChannelId: string | null,
  ) {
    const msg = JSON.stringify({
      type: 'voiceMembership',
      guildId,
      userId,
      voiceChannelId,
    })
    this.rawSend(msg)
  }

  /** Push every cached voice state for this guild. Used to backfill the
   *  music server when a guild becomes available or the link reconnects. */
  sendVoiceSnapshotForGuild(guild: Guild) {
    for (const [userId, vs] of guild.voiceStates.cache) {
      if (vs.channelId) {
        this.sendVoiceMembership(guild.id, userId, vs.channelId)
      }
    }
  }

  sendAllVoiceSnapshots() {
    for (const guild of this.client.guilds.cache.values()) {
      this.sendVoiceSnapshotForGuild(guild)
    }
  }

  private rawSend(json: string) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(json)
    } else {
      this.pending.push(json)
    }
  }
}

let connection: MusicServerConnection | null = null

export function getMusicServerConnection(): MusicServerConnection | null {
  return connection
}

export function initMusicServerConnection(
  client: BotClient,
): MusicServerConnection {
  const c = new MusicServerConnection(client)
  connection = c
  c.connect()
  client.on('voiceStateUpdate', (_old, newS) => {
    c.sendVoiceMembership(newS.guild.id, newS.id, newS.channelId)
  })
  // discord.js voiceStateUpdate only fires on changes, so users already in
  // a channel before the bot logged in (or before a guild loaded) would
  // never appear in the server's mirror. Backfill on guild availability.
  client.on('guildCreate', (guild) => {
    c.sendVoiceSnapshotForGuild(guild)
  })
  if (client.isReady()) {
    c.sendAllVoiceSnapshots()
  } else {
    client.once('clientReady', () => {
      c.sendAllVoiceSnapshots()
    })
  }
  return c
}
