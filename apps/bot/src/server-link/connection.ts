import type { Guild } from 'discord.js'
import WebSocket from 'ws'
import { assertRequiredEnv } from '../config/env.js'
import type { BotClient } from '../types/commands.js'
import {
  type ServerEvent,
  serverToBotMessageSchema,
} from './contracts.js'

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
    const ws = new WebSocket(wsEndpoint())
    this.ws = ws

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'botHello',
          token: assertRequiredEnv('BOT_LINK_TOKEN'),
        }),
      )
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
        // ignore invalid payloads
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
    this.rawSend(
      JSON.stringify({
        type: 'rawGateway',
        payload,
      }),
    )
  }

  sendVoiceMembership(
    guildId: string,
    userId: string,
    voiceChannelId: string | null,
  ) {
    this.rawSend(
      JSON.stringify({
        type: 'voiceMembership',
        guildId,
        userId,
        voiceChannelId,
      }),
    )
  }

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
