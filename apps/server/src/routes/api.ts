import type { Request, Response } from 'express'
import { Router } from 'express'
import type { LavalinkManager, Track } from 'lavalink-client'
import type pino from 'pino'
import {
  addToQueueBodySchema,
  loopBodySchema,
  moveQueueBodySchema,
  pauseBodySchema,
  playBodySchema,
  seekBodySchema,
  volumeBodySchema,
} from '../contracts/types.js'
import { z } from 'zod'
import type { Env } from '../config/env.js'
import { playerToSnapshot } from '../lavalink/snapshot.js'
import type { BotLink } from '../links/bot-link.js'
import type { EventHub } from '../links/event-hub.js'
import { buildSearchQuery } from '../music/query.js'
import type { VoiceMirror } from '../voice/mirror.js'

type SessionUser = {
  id: string
  username?: string
  globalName?: string
  avatarUrl?: string
}

type RequesterInfo = {
  id: string
  name?: string
  avatarUrl?: string
}

function requesterFromSession(user: SessionUser | undefined): RequesterInfo | null {
  if (!user?.id) {
    return null
  }
  return {
    id: user.id,
    name: user.globalName ?? user.username,
    avatarUrl: user.avatarUrl,
  }
}

function buildRequesterForWrite(
  req: AuthedRequest,
  env: Env,
  explicit: { requesterId: string; requesterName?: string; requesterAvatarUrl?: string },
): RequesterInfo {
  if (isBotRequest(req, env)) {
    return {
      id: explicit.requesterId,
      name: explicit.requesterName,
      avatarUrl: explicit.requesterAvatarUrl,
    }
  }
  const session = requesterFromSession(req.user)
  return {
    id: session?.id ?? explicit.requesterId,
    name: explicit.requesterName ?? session?.name,
    avatarUrl: explicit.requesterAvatarUrl ?? session?.avatarUrl,
  }
}
type QueryShape = Record<string, string | string[] | undefined>

type AuthedRequest = Request<
  Record<string, string>,
  unknown,
  unknown,
  QueryShape
> & {
  user?: SessionUser
  isAuthenticated?: () => boolean
}

export type ApiContext = {
  env: Env
  log: pino.Logger
  manager: LavalinkManager
  botLink: BotLink
  voiceMirror: VoiceMirror
  eventHub: EventHub
}

function isBotRequest(req: AuthedRequest, env: Env): boolean {
  return req.header('authorization') === `Bearer ${env.botLinkToken}`
}

function requireBotOrUser(req: AuthedRequest, res: Response, env: Env): boolean {
  if (isBotRequest(req, env)) {
    return true
  }
  if (req.isAuthenticated?.() && req.user?.id) {
    return true
  }
  res.status(401).json({ error: 'Unauthorized' })
  return false
}

function maybeRequireBotForWrite(
  req: AuthedRequest,
  res: Response,
  env: Env,
  botLink: BotLink,
): boolean {
  if (req.method === 'GET' || req.method === 'HEAD') {
    return true
  }
  if (isBotRequest(req, env)) {
    if (!botLink.botConnected) {
      res.status(503).json({ error: 'Bot gateway offline', code: 'BOT_OFFLINE' })
      return false
    }
    return true
  }
  return true
}

async function requireWebAccess(
  req: AuthedRequest,
  res: Response,
  ctx: ApiContext,
  guildId: string,
): Promise<boolean> {
  if (isBotRequest(req, ctx.env)) {
    return true
  }
  const userId = req.user?.id
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  const player = ctx.manager.getPlayer(guildId)
  const botVc = player?.voiceChannelId ?? null
  const userVc = ctx.voiceMirror.getUserVoice(guildId, userId) ?? null
  const allowed = !!botVc && !!userVc && botVc === userVc
  if (!allowed) {
    res.status(403).json({ error: 'Join the same voice channel as the bot.' })
    return false
  }
  return true
}

export function createApiRouter(ctx: ApiContext): Router {
  const { env, manager, botLink, voiceMirror, log, eventHub } = ctx
  const router = Router()

  router.get('/health', (_req, res) => {
    res.json({ ok: true })
  })

  router.get('/api/me', (req: AuthedRequest, res) => {
    if (!req.isAuthenticated?.() || !req.user?.id) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.json({
      userId: req.user.id,
      username: req.user.username,
      globalName: req.user.globalName,
      avatarUrl: req.user.avatarUrl,
    })
  })

  router.get('/api/events', (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (isBotRequest(req, env)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
    })
    res.write('\n')
    eventHub.attachSseClient(res)
  })

  router.get('/api/commands', (_req: AuthedRequest, res) => {
    res.json({ commands: botLink.commandsManifest })
  })

  router.get('/api/players', (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    const players = []
    for (const guildId of manager.players.keys()) {
      const player = manager.getPlayer(guildId)
      if (player) {
        players.push(playerToSnapshot(player))
      }
    }
    if (isBotRequest(req, env)) {
      res.json({ players })
      return
    }
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    const filtered = players.filter((p) => {
      const botVc = p.voiceChannelId
      const userVc = voiceMirror.getUserVoice(p.guildId, userId) ?? null
      return !!botVc && !!userVc && botVc === userVc
    })
    res.json({ players: filtered })
  })

  router.get('/api/players/:guildId', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    res.json({ player: playerToSnapshot(p) })
  })

  router.get('/api/controller', (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (isBotRequest(req, env)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const userId = req.user?.id
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' })
      return
    }
    for (const guildId of manager.players.keys()) {
      const p = manager.getPlayer(guildId)
      const botVc = p?.voiceChannelId
      if (!p || !botVc) {
        continue
      }
      if (voiceMirror.getUserVoice(guildId, userId) === botVc) {
        return res.json({ player: playerToSnapshot(p) })
      }
    }
    res.json({ player: null })
  })

  router.get('/api/access/lookup/:userId', (req: AuthedRequest, res) => {
    if (!isBotRequest(req, env)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const userId = req.params.userId
    for (const guildId of manager.players.keys()) {
      const p = manager.getPlayer(guildId)
      const botVc = p?.voiceChannelId
      if (!p || !botVc) {
        continue
      }
      if (voiceMirror.getUserVoice(guildId, userId) === botVc) {
        return res.json({ guildId, voiceChannelId: botVc })
      }
    }
    res.json({ guildId: null, voiceChannelId: null })
  })

  router.get('/api/access/:guildId/:userId', (req: AuthedRequest, res) => {
    if (!isBotRequest(req, env)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const guildId = req.params.guildId
    const userId = req.params.userId
    const p = manager.getPlayer(guildId)
    const botVc = p?.voiceChannelId ?? null
    const userVc = voiceMirror.getUserVoice(guildId, userId) ?? null
    const allowed = !!botVc && !!userVc && botVc === userVc
    res.json({
      allowed,
      voiceChannelId: userVc,
      botVoiceChannelId: botVc,
    })
  })

  router.get('/api/search', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    const q = typeof req.query.query === 'string' ? req.query.query : ''
    if (!q.trim()) {
      return res.status(400).json({ error: 'Missing query' })
    }
    const node = manager.nodeManager.nodes.get('main')
    if (!node) {
      return res.status(503).json({ error: 'No Lavalink node' })
    }
    try {
      const result = await node.search(buildSearchQuery(q), { id: 'search' }, false)
      res.json(result)
    } catch (e) {
      log.error(e, 'search failed')
      res.status(500).json({ error: 'Search failed' })
    }
  })

  router.post('/api/players/:guildId/join', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const bodyParse = z
      .object({
        voiceChannelId: z.string(),
        textChannelId: z.string().optional(),
      })
      .safeParse(req.body)
    if (!bodyParse.success) {
      res.status(400).json({ error: 'Invalid body' })
      return
    }
    let player = manager.getPlayer(guildId)
    if (!player) {
      player = manager.createPlayer({
        guildId,
        voiceChannelId: bodyParse.data.voiceChannelId,
        textChannelId: bodyParse.data.textChannelId,
        selfDeaf: true,
      })
      await player.connect()
    } else if (player.voiceChannelId !== bodyParse.data.voiceChannelId) {
      await player.changeVoiceState({ voiceChannelId: bodyParse.data.voiceChannelId })
    }
    res.json({ ok: true, player: playerToSnapshot(player) })
  })

  router.post('/api/players/:guildId/play', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const body = playBodySchema.safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ error: 'Invalid body' })
      return
    }
    let player = manager.getPlayer(guildId)
    if (!player) {
      player = manager.createPlayer({
        guildId,
        voiceChannelId: body.data.voiceChannelId,
        textChannelId: body.data.textChannelId,
        selfDeaf: true,
      })
      await player.connect()
    } else if (player.voiceChannelId !== body.data.voiceChannelId) {
      await player.changeVoiceState({ voiceChannelId: body.data.voiceChannelId })
    }
    const requester = buildRequesterForWrite(req, env, {
      requesterId: body.data.requesterId,
      requesterName: body.data.requesterName,
      requesterAvatarUrl: body.data.requesterAvatarUrl,
    })
    const result = await player.search(buildSearchQuery(body.data.query), requester)
    if (result.loadType === 'empty' || result.loadType === 'error') {
      res.status(400).json({ error: 'Nothing matched' })
      return
    }
    const tracks = result.tracks
    if (!tracks.length) {
      res.status(400).json({ error: 'No tracks' })
      return
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
    res.json({ ok: true, player: playerToSnapshot(player) })
  })

  router.post('/api/players/:guildId/pause', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    const parsed = pauseBodySchema.safeParse(req.body ?? {})
    const paused = parsed.success ? parsed.data?.paused : undefined
    // lavalink-client mutates `p.paused` locally before the PATCH (via syncPlayerData),
    // so we can respond with the predicted snapshot without waiting on the REST round trip.
    let action: Promise<unknown>
    if (paused === undefined) {
      action = p.paused ? p.resume() : p.pause()
    } else if (paused) {
      action = p.pause()
    } else {
      action = p.resume()
    }
    action.catch((e) => log.error(e, 'pause/resume PATCH failed'))
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/resume', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    p.resume().catch((e) => log.error(e, 'resume PATCH failed'))
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/skip', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    await p.skip()
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/seek', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    const body = seekBodySchema.safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ error: 'Invalid body' })
      return
    }
    await p.seek(body.data.positionMs)
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/volume', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    const body = volumeBodySchema.safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ error: 'Invalid body' })
      return
    }
    p.setVolume(body.data.volume).catch((e) =>
      log.error(e, 'volume PATCH failed'),
    )
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/loop', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    const body = loopBodySchema.safeParse(req.body)
    if (!body.success) {
      res.status(400).json({ error: 'Invalid body' })
      return
    }
    p.setRepeatMode(body.data.mode).catch((e) =>
      log.error(e, 'loop PATCH failed'),
    )
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/shuffle', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    // queue.shuffle reorders this.tracks synchronously before persisting, so
    // playerToSnapshot below already reflects the new order.
    p.queue.shuffle().catch((e) => log.error(e, 'shuffle save failed'))
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/clear', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    await p.queue.splice(0, p.queue.tracks.length)
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/queue', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const body = addToQueueBodySchema.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid body' })
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    const requester = buildRequesterForWrite(req, env, {
      requesterId: body.data.requesterId,
      requesterName: body.data.requesterName,
      requesterAvatarUrl: body.data.requesterAvatarUrl,
    })
    let track: Track
    try {
      track = await p.node.decode.singleTrack(body.data.encoded, requester)
    } catch (e) {
      log.error(e, 'failed to decode track')
      return res.status(400).json({ error: 'Invalid encoded track' })
    }
    const wasActive = p.playing || p.paused
    await p.queue.add(track, body.data.position)
    if (!wasActive) {
      await p.play()
    }
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.delete('/api/players/:guildId/queue/:index', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const idx = parseInt(req.params.index, 10)
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    if (Number.isNaN(idx) || idx < 0) {
      return res.status(400).json({ error: 'Bad index' })
    }
    await p.queue.remove(idx)
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/queue/move', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const body = moveQueueBodySchema.safeParse(req.body)
    if (!body.success) {
      return res.status(400).json({ error: 'Invalid body' })
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    const { queue } = p
    const len = queue.tracks.length
    if (
      body.data.from < 0 ||
      body.data.to < 0 ||
      body.data.from >= len ||
      body.data.to >= len
    ) {
      return res.status(400).json({ error: 'Invalid positions' })
    }
    if (body.data.from === body.data.to) {
      return res.json({ ok: true, player: playerToSnapshot(p) })
    }
    const removed = await queue.splice(body.data.from, 1)
    const moved = Array.isArray(removed) ? removed[0] : removed
    if (!moved) {
      return res.status(400).json({ error: 'Move failed' })
    }
    const insertPos = body.data.to > body.data.from ? body.data.to - 1 : body.data.to
    await queue.splice(insertPos, 0, moved as Track)
    res.json({ ok: true, player: playerToSnapshot(p) })
  })

  router.post('/api/players/:guildId/stop', async (req: AuthedRequest, res) => {
    if (!requireBotOrUser(req, res, env)) {
      return
    }
    if (!maybeRequireBotForWrite(req, res, env, botLink)) {
      return
    }
    const guildId = req.params.guildId
    if (!(await requireWebAccess(req, res, ctx, guildId))) {
      return
    }
    const p = manager.getPlayer(guildId)
    if (!p) {
      return res.status(404).json({ error: 'No player' })
    }
    await p.destroy()
    res.json({ ok: true })
  })

  return router
}
