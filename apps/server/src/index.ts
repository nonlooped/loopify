import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import express from 'express'
import cors from 'cors'
import session from 'express-session'
import passport from 'passport'
import { Strategy as DiscordStrategy } from 'passport-discord'
import { LavalinkManager } from 'lavalink-client'
import pino from 'pino'
import FileStoreFactory from 'session-file-store'
import { WebSocketServer } from 'ws'
import { createServer } from 'node:http'
import { loadEnv } from './config/env.js'
import { wireLavalinkEvents } from './events/broadcaster.js'
import { BotLink } from './links/bot-link.js'
import { EventHub } from './links/event-hub.js'
import { createApiRouter } from './routes/api.js'
import { VoiceMirror } from './voice/mirror.js'

type SessionUser = {
  id: string
  username?: string
  globalName?: string
  avatarUrl?: string
}

declare global {
  namespace Express {
    interface User extends SessionUser {}
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main() {
  const env = loadEnv()
  const log = pino({ level: process.env.LOG_LEVEL ?? 'info' })
  const voiceMirror = new VoiceMirror()
  const eventHub = new EventHub()
  const app = express()
  app.use(
    cors({
      origin: env.publicBaseUrl,
      credentials: true,
    }),
  )
  app.use(express.json({ limit: '1mb' }))

  const FileStore = FileStoreFactory(session)
  const dataDir = path.resolve(__dirname, '../.data')
  fs.mkdirSync(dataDir, { recursive: true })
  app.use(
    session({
      store: new FileStore({
        path: dataDir,
        retries: 0,
      }),
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  )

  passport.serializeUser((user, done) => {
    done(null, user)
  })
  passport.deserializeUser((user: SessionUser, done) => {
    done(null, user)
  })
  passport.use(
    new DiscordStrategy(
      {
        clientID: env.discordClientId,
        clientSecret: env.discordClientSecret,
        callbackURL: env.discordRedirectUri,
        scope: ['identify'],
      },
      (_accessToken, _refreshToken, profile, done) => {
        const raw = profile as unknown as {
          id: string
          username?: string
          global_name?: string | null
          avatar?: string | null
          discriminator?: string | null
        }
        let avatarUrl: string | undefined
        if (raw.avatar) {
          const ext = raw.avatar.startsWith('a_') ? 'gif' : 'png'
          avatarUrl = `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.${ext}?size=64`
        } else {
          const disc = raw.discriminator ? Number(raw.discriminator) : 0
          const idx = Number.isFinite(disc) && disc > 0
            ? disc % 5
            : Number((BigInt(raw.id) >> 22n) % 6n)
          avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`
        }
        done(null, {
          id: raw.id,
          username: raw.username,
          globalName: raw.global_name ?? undefined,
          avatarUrl,
        })
      },
    ),
  )
  app.use(passport.initialize())
  app.use(passport.session())

  app.get('/auth/discord', passport.authenticate('discord'))
  app.get(
    '/auth/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/login' }),
    (_req, res) => {
      res.redirect(`${env.publicBaseUrl}/`)
    },
  )
  app.get('/auth/logout', (req, res) => {
    req.logout(() => {
      req.session.destroy(() => {
        res.clearCookie('connect.sid')
        res.redirect(`${env.publicBaseUrl}/login`)
      })
    })
  })

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

  manager.nodeManager.on('error', (node, error) => {
    log.error(
      {
        nodeId: node?.options?.id ?? 'unknown',
        host: node?.options?.host,
        port: node?.options?.port,
        err: error,
      },
      'lavalink node connection error (is lavalink running?)',
    )
  })

  botLink = new BotLink(manager, voiceMirror, env.botLinkToken, log, (ev) =>
    eventHub.broadcast(ev),
  )

  await manager.init({
    id: env.clientId,
    username: env.botUsername,
  })

  wireLavalinkEvents(manager, eventHub, botLink)
  app.use(
    createApiRouter({
      env,
      log,
      manager,
      botLink,
      voiceMirror,
      eventHub,
    }),
  )

  if (process.env.NODE_ENV === 'production') {
    const staticRoot = path.resolve(__dirname, '../../web/dist/client')
    app.use(express.static(staticRoot))
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticRoot, 'index.html'))
    })
  }

  const server = createServer(app)
  const wssBot = new WebSocketServer({ noServer: true })
  wssBot.on('connection', (ws) => {
    botLink.attachWebSocket(ws)
  })

  server.on('upgrade', (request, socket, head) => {
    const host = request.headers.host ?? 'localhost'
    const url = new URL(request.url ?? '/', `http://${host}`)
    if (url.pathname === '/bot') {
      wssBot.handleUpgrade(request, socket, head, (ws) => {
        wssBot.emit('connection', ws, request)
      })
      return
    }
    socket.destroy()
  })

  server.listen(env.port, '0.0.0.0', () => {
    log.info({ port: env.port }, 'loopify-server listening')
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
