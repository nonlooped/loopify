import type { Response } from 'express'
import type { ServerEvent } from '../contracts/types.js'

export class EventHub {
  private clients = new Set<Response>()

  attachSseClient(res: Response) {
    this.clients.add(res)
    res.on('close', () => {
      this.clients.delete(res)
    })
  }

  broadcast(event: ServerEvent) {
    const payload = `data: ${JSON.stringify({ type: 'serverEvent', event })}\n\n`
    for (const client of this.clients) {
      client.write(payload)
    }
  }
}
