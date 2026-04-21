import {
  addToQueueBodySchema,
  loopBodySchema,
  moveQueueBodySchema,
  pauseBodySchema,
  playBodySchema,
  seekBodySchema,
  volumeBodySchema,
} from '@loopify/protocol'
import { Hono } from 'hono'
import type { LavalinkManager, Track } from 'lavalink-client'
import type pino from 'pino'
import { z } from 'zod'
import type { Env } from '../config/env.js'
import { playerToSnapshot } from '../lavalink/snapshot.js'
import type { BotLink } from '../links/bot-link.js'
import { buildSearchQuery } from '../music/query.js'
import type { VoiceMirror } from '../voice/mirror.js'

export type ApiContext = {
  env: Env
  log: pino.Logger
  manager: LavalinkManager
  botLink: BotLink
  voiceMirror: VoiceMirror
}

export function createApiRouter(ctx: ApiContext) {
  const { env, manager, botLink, voiceMirror, log } = ctx
  const app = new Hono()

  app.use('/*', async (c, next) => {
    /** Docker/load balancer healthchecks call GET /health without a bearer token */
    if (
      (c.req.method === 'GET' || c.req.method === 'HEAD') &&
      c.req.path === '/health'
    ) {
      return c.json({ ok: true })
    }
    const auth = c.req.header('authorization')
    if (auth !== `Bearer ${env.internalApiToken}`) {
      return c.json({ error: 'Unauthorized' }, 401)
    }
    await next()
  })

  /** GET/HEAD skip bot; all mutating methods require bot gateway */
  app.use('/*', async (c, next) => {
    const method = c.req.method
    if (method === 'GET' || method === 'HEAD') {
      return next()
    }
    if (!botLink.botConnected) {
      return c.json({ error: 'Bot gateway offline', code: 'BOT_OFFLINE' }, 503)
    }
    await next()
  })

  app.get('/api/commands', (c) => {
    return c.json({ commands: botLink.commandsManifest })
  })

  app.get('/api/players', (c) => {
    const snaps = []
    for (const guildId of manager.players.keys()) {
      const p = manager.getPlayer(guildId)
      if (p) {
        snaps.push(playerToSnapshot(p))
      }
    }
    return c.json({ players: snaps })
  })

  app.get('/api/players/:guildId', (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    return c.json({ player: playerToSnapshot(p) })
  })

  app.get('/api/access/lookup/:userId', (c) => {
    const userId = c.req.param('userId')
    for (const guildId of manager.players.keys()) {
      const p = manager.getPlayer(guildId)
      const botVc = p?.voiceChannelId
      if (!p || !botVc) {
        continue
      }
      if (voiceMirror.getUserVoice(guildId, userId) === botVc) {
        return c.json({ guildId, voiceChannelId: botVc })
      }
    }
    return c.json({ guildId: null, voiceChannelId: null })
  })

  app.get('/api/access/:guildId/:userId', (c) => {
    const guildId = c.req.param('guildId')
    const userId = c.req.param('userId')
    const p = manager.getPlayer(guildId)
    const botVc = p?.voiceChannelId ?? null
    const userVc = voiceMirror.getUserVoice(guildId, userId) ?? null
    const allowed = !!botVc && !!userVc && botVc === userVc
    return c.json({
      allowed,
      voiceChannelId: userVc,
      botVoiceChannelId: botVc,
    })
  })

  app.get('/api/search', async (c) => {
    const q = c.req.query('query') ?? ''
    if (!q.trim()) {
      return c.json({ error: 'Missing query' }, 400)
    }
    const node = manager.nodeManager.nodes.get('main')
    if (!node) {
      return c.json({ error: 'No Lavalink node' }, 503)
    }
    try {
      const res = await node.search(
        buildSearchQuery(q),
        { id: 'search' },
        false,
      )
      return c.json(res)
    } catch (e) {
      log.error(e, 'search failed')
      return c.json(
        { error: e instanceof Error ? e.message : 'Search failed' },
        500,
      )
    }
  })

  app.post('/api/players/:guildId/join', async (c) => {
    const guildId = c.req.param('guildId')
    let body: { voiceChannelId: string; textChannelId?: string }
    try {
      body = z
        .object({
          voiceChannelId: z.string(),
          textChannelId: z.string().optional(),
        })
        .parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid body' }, 400)
    }
    let player = manager.getPlayer(guildId)
    if (!player) {
      player = manager.createPlayer({
        guildId,
        voiceChannelId: body.voiceChannelId,
        textChannelId: body.textChannelId,
        selfDeaf: true,
      })
      await player.connect()
    } else if (player.voiceChannelId !== body.voiceChannelId) {
      await player.changeVoiceState({ voiceChannelId: body.voiceChannelId })
    }
    return c.json({ ok: true, player: playerToSnapshot(player) })
  })

  app.post('/api/players/:guildId/play', async (c) => {
    const guildId = c.req.param('guildId')
    let body: z.infer<typeof playBodySchema>
    try {
      body = playBodySchema.parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid body' }, 400)
    }
    const requester = { id: body.requesterId }
    let player = manager.getPlayer(guildId)
    if (!player) {
      player = manager.createPlayer({
        guildId,
        voiceChannelId: body.voiceChannelId,
        textChannelId: body.textChannelId,
        selfDeaf: true,
      })
      await player.connect()
    } else if (player.voiceChannelId !== body.voiceChannelId) {
      await player.changeVoiceState({ voiceChannelId: body.voiceChannelId })
    }
    const result = await player.search(buildSearchQuery(body.query), requester)
    if (result.loadType === 'empty' || result.loadType === 'error') {
      return c.json(
        {
          error:
            'exception' in result && result.exception?.message
              ? result.exception.message
              : 'Nothing matched',
        },
        400,
      )
    }
    const tracks = result.tracks
    if (!tracks.length) {
      return c.json({ error: 'No tracks' }, 400)
    }
    const wasActive = player.playing || player.paused
    if (result.loadType === 'playlist') {
      await player.queue.add(tracks)
    } else {
      await player.queue.add(tracks[0])
    }
    if (!wasActive) {
      await player.play()
    }
    return c.json({ ok: true, player: playerToSnapshot(player) })
  })

  app.post('/api/players/:guildId/pause', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    let paused: boolean | undefined
    try {
      const raw = await c.req.json().catch(() => ({}))
      const parsed = pauseBodySchema.safeParse(raw)
      paused = parsed.success ? parsed.data?.paused : undefined
    } catch {
      /* noop */
    }
    if (paused === undefined) {
      if (p.paused) {
        await p.resume()
      } else {
        await p.pause()
      }
    } else if (paused) {
      await p.pause()
    } else {
      await p.resume()
    }
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/resume', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    await p.resume()
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/skip', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    await p.skip()
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/seek', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    let body: z.infer<typeof seekBodySchema>
    try {
      body = seekBodySchema.parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid body' }, 400)
    }
    await p.seek(body.positionMs)
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/volume', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    let body: z.infer<typeof volumeBodySchema>
    try {
      body = volumeBodySchema.parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid body' }, 400)
    }
    await p.setVolume(body.volume)
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/loop', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    let body: z.infer<typeof loopBodySchema>
    try {
      body = loopBodySchema.parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid body' }, 400)
    }
    await p.setRepeatMode(body.mode)
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/shuffle', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    await p.queue.shuffle()
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/clear', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    await p.queue.splice(0, p.queue.tracks.length)
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/queue', async (c) => {
    const guildId = c.req.param('guildId')
    let body: z.infer<typeof addToQueueBodySchema>
    try {
      body = addToQueueBodySchema.parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid body' }, 400)
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    const requester = { id: body.requesterId }
    let track: Track
    try {
      track = await p.node.decode.singleTrack(body.encoded, requester)
    } catch (e) {
      log.error(e, 'failed to decode track')
      return c.json({ error: 'Invalid encoded track' }, 400)
    }
    const wasActive = p.playing || p.paused
    await p.queue.add(track, body.position)
    if (!wasActive) {
      await p.play()
    }
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.delete('/api/players/:guildId/queue/:index', async (c) => {
    const guildId = c.req.param('guildId')
    const idx = parseInt(c.req.param('index'), 10)
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    if (Number.isNaN(idx) || idx < 0) {
      return c.json({ error: 'Bad index' }, 400)
    }
    await p.queue.remove(idx)
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/queue/move', async (c) => {
    const guildId = c.req.param('guildId')
    let body: z.infer<typeof moveQueueBodySchema>
    try {
      body = moveQueueBodySchema.parse(await c.req.json())
    } catch {
      return c.json({ error: 'Invalid body' }, 400)
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    const { queue } = p
    const len = queue.tracks.length
    if (body.from < 0 || body.to < 0 || body.from >= len || body.to >= len) {
      return c.json({ error: 'Invalid positions' }, 400)
    }
    if (body.from === body.to) {
      return c.json({ ok: true, player: playerToSnapshot(p) })
    }
    const removed = await queue.splice(body.from, 1)
    const moved = Array.isArray(removed) ? removed[0] : removed
    if (!moved) {
      return c.json({ error: 'Move failed' }, 400)
    }
    const insertPos = body.to > body.from ? body.to - 1 : body.to
    await queue.splice(insertPos, 0, moved as Track)
    return c.json({ ok: true, player: playerToSnapshot(p) })
  })

  app.post('/api/players/:guildId/stop', async (c) => {
    const guildId = c.req.param('guildId')
    const p = manager.getPlayer(guildId)
    if (!p) {
      return c.json({ error: 'No player' }, 404)
    }
    await p.destroy()
    return c.json({ ok: true })
  })

  return app
}
