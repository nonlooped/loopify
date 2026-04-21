import type { ServerEvent } from '@loopify/protocol'
import { serverEventPushSchema } from '@loopify/protocol'
import WebSocket from 'ws'

import type { WebEnv } from './env.js'

type Handler = (ev: ServerEvent) => void

/** Single outbound WS to loopify `apps/server` /web — fans events to handlers */
export class MusicUpstream {
  private handlers = new Set<Handler>()
  private reconnect: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly env: WebEnv) {}

  connect() {
    const base = this.env.musicServerUrl.replace(/^http/, 'ws')
    const url = `${base}/web`
    const ws = new WebSocket(url)

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          type: 'webHello',
          token: this.env.internalToken,
        }),
      )
    })

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(String(raw))
        const parsed = serverEventPushSchema.safeParse(data)
        if (!parsed.success) {
          return
        }
        const ev = parsed.data.event
        for (const h of this.handlers) {
          h(ev)
        }
      } catch {
        /* ignore */
      }
    })

    ws.on('close', () => {
      if (!this.reconnect) {
        this.reconnect = setTimeout(() => {
          this.reconnect = null
          this.connect()
        }, 3000)
      }
    })
  }

  onEvent(handler: Handler) {
    this.handlers.add(handler)
    return () => this.handlers.delete(handler)
  }

  upstreamFetch(path: string, init?: RequestInit) {
    return fetch(`${this.env.musicServerUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.env.internalToken}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    })
  }
}
