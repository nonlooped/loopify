import { serve } from '@hono/node-server'
import { LavalinkManager } from 'lavalink-client'
import pino from 'pino'
import { WebSocketServer } from 'ws'

import { loadEnv } from './config/env.js'
import { wireLavalinkEvents } from './events/broadcaster.js'
import { BotLink } from './links/bot-link.js'
import { WebLink } from './links/web-link.js'
import { createApiRouter } from './routes/api.js'
import { VoiceMirror } from './voice/mirror.js'

async function main() {
  const env = loadEnv()
  const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })
  const voiceMirror = new VoiceMirror()
  const webLink = new WebLink(env.internalApiToken, log)

  let botLink: BotLink
  const manager = new LavalinkManager({
    nodes: [
      {
        id: 'main',
        host: env.lavalinkHost,
        port: env.lavalinkPort,
        authorization: env.lavalinkPassword,
      },
    ],
    sendToShard: (guildId, payload) => {
      botLink.sendGatewayToBot(guildId, payload)
    },
    autoSkip: true,
    client: {
      id: env.clientId,
      username: env.botUsername,
    },
  })

  botLink = new BotLink(manager, voiceMirror, env.internalApiToken, log, (ev) =>
    webLink.broadcast(ev),
  )

  await manager.init({
    id: env.clientId,
    username: env.botUsername,
  })

  wireLavalinkEvents(manager, webLink, botLink)

  const api = createApiRouter({
    env,
    log,
    manager,
    botLink,
    voiceMirror,
  })

  const server = serve(
    {
      fetch: api.fetch,
      port: env.port,
      hostname: '0.0.0.0',
    },
    (info) => {
      log.info({ port: info.port }, 'loopify-server listening')
    },
  )

  const wssBot = new WebSocketServer({ noServer: true })
  const wssWeb = new WebSocketServer({ noServer: true })

  wssBot.on('connection', (ws) => {
    botLink.attachWebSocket(ws)
  })
  wssWeb.on('connection', (ws) => {
    webLink.handleConnection(ws)
  })

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host ?? 'localhost'
    const url = new URL(request.url ?? '/', `http://${host}`)
    if (url.pathname === '/bot') {
      wssBot.handleUpgrade(request, socket, head, (ws) => {
        wssBot.emit('connection', ws, request)
      })
    } else if (url.pathname === '/web') {
      wssWeb.handleUpgrade(request, socket, head, (ws) => {
        wssWeb.emit('connection', ws, request)
      })
    } else {
      socket.destroy()
    }
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
