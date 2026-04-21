import type { ServerEvent } from '@loopify/protocol'
import {
  serverEventPushSchema,
  webHelloSchema,
  webToServerMessageSchema,
} from '@loopify/protocol'
import type pino from 'pino'
import type { WebSocket } from 'ws'

export class WebLink {
  private connections = new Set<WebSocket>()

  constructor(
    private readonly token: string,
    private readonly log: pino.Logger,
  ) {}

  handleConnection(ws: WebSocket) {
    let authed = false
    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw))
        const parsed = webToServerMessageSchema.safeParse(data)
        if (!parsed.success) {
          this.log.warn({ err: parsed.error }, 'invalid web WS message')
          ws.close(4002, 'invalid message')
          return
        }
        const msg = parsed.data
        if (msg.type === 'webHello') {
          const hello = webHelloSchema.safeParse(msg)
          if (!hello.success || hello.data.token !== this.token) {
            ws.close(4001, 'unauthorized')
            return
          }
          authed = true
          this.connections.add(ws)
          this.log.info('web link authenticated')
          return
        }
        if (!authed) {
          ws.close(4001, 'unauthorized')
        }
      } catch (e) {
        this.log.error(e, 'web ws parse error')
        ws.close(1011, 'parse error')
      }
    })

    ws.on('close', () => {
      this.connections.delete(ws)
    })
  }

  broadcast(event: ServerEvent) {
    const payload = JSON.stringify(
      serverEventPushSchema.parse({ type: 'serverEvent', event }),
    )
    for (const ws of this.connections) {
      if (ws.readyState === 1) {
        ws.send(payload)
      }
    }
  }
}
