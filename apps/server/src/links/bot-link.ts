import type { CommandInfo, ServerEvent } from '@loopify/protocol'
import {
  botToServerMessageSchema,
  serverEventPushSchema,
} from '@loopify/protocol'
import type { LavalinkManager } from 'lavalink-client'
import type pino from 'pino'
import type { WebSocket } from 'ws'
import type { VoiceMirror } from '../voice/mirror.js'

type GatewayPending = { guildId: string; payload: unknown }

export class BotLink {
  private botWs: WebSocket | null = null
  /** Single bot connection */
  botConnected = false
  private pendingGateway: GatewayPending[] = []
  /** Latest slash-command manifest pushed by the bot on connect. */
  commandsManifest: CommandInfo[] = []

  constructor(
    private readonly manager: LavalinkManager,
    private readonly voiceMirror: VoiceMirror,
    private readonly token: string,
    private readonly log: pino.Logger,
    private readonly onVoiceBroadcast: (ev: ServerEvent) => void,
  ) {}

  attachWebSocket(ws: WebSocket) {
    this.botWs = ws

    ws.on('message', async (raw) => {
      try {
        const data = JSON.parse(String(raw))
        const parsed = botToServerMessageSchema.safeParse(data)
        if (!parsed.success) {
          this.log.warn({ err: parsed.error }, 'invalid bot WS message')
          return
        }
        const msg = parsed.data
        if (msg.type === 'botHello') {
          if (msg.token !== this.token) {
            ws.close(4001, 'unauthorized')
            return
          }
          this.botConnected = true
          this.log.info('bot link authenticated')
          this.flushPendingGateway()
          return
        }
        if (msg.type === 'rawGateway') {
          await this.manager.sendRawData(msg.payload as never)
          return
        }
        if (msg.type === 'voiceMembership') {
          this.voiceMirror.set(msg.guildId, msg.userId, msg.voiceChannelId)
          const ev: ServerEvent = {
            type: 'voiceStateUpdate',
            guildId: msg.guildId,
            userId: msg.userId,
            voiceChannelId: msg.voiceChannelId,
          }
          this.onVoiceBroadcast(ev)
          return
        }
        if (msg.type === 'commandsManifest') {
          this.commandsManifest = msg.commands
          this.log.info(
            { count: msg.commands.length },
            'received commands manifest from bot',
          )
          return
        }
      } catch (e) {
        this.log.error(e, 'bot ws handler error')
      }
    })

    ws.on('close', () => {
      if (this.botWs === ws) {
        this.botWs = null
        this.botConnected = false
        this.commandsManifest = []
        this.log.warn('bot link disconnected')
      }
    })
  }

  private flushPendingGateway() {
    if (!this.botWs || this.botWs.readyState !== 1) {
      return
    }
    for (const p of this.pendingGateway) {
      this.sendGatewayToBotNow(p.guildId, p.payload)
    }
    this.pendingGateway = []
  }

  sendGatewayToBot(guildId: string, payload: unknown) {
    if (!this.botWs || !this.botConnected || this.botWs.readyState !== 1) {
      this.pendingGateway.push({ guildId, payload })
      return
    }
    this.sendGatewayToBotNow(guildId, payload)
  }

  private sendGatewayToBotNow(guildId: string, payload: unknown) {
    if (!this.botWs || this.botWs.readyState !== 1) {
      return
    }
    const msg = { type: 'gatewaySend' as const, guildId, payload }
    this.botWs.send(JSON.stringify(msg))
  }

  pushServerEvent(event: ServerEvent) {
    if (!this.botWs || !this.botConnected || this.botWs.readyState !== 1) {
      return
    }
    const payload = JSON.stringify(
      serverEventPushSchema.parse({ type: 'serverEvent', event }),
    )
    this.botWs.send(payload)
  }
}
