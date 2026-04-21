import type { ServerEvent } from '@loopify/protocol'
import type { LavalinkManager } from 'lavalink-client'
import { playerToSnapshot } from '../lavalink/snapshot.js'
import type { BotLink } from '../links/bot-link.js'
import type { WebLink } from '../links/web-link.js'

export function wireLavalinkEvents(
  manager: LavalinkManager,
  webLink: WebLink,
  botLink: BotLink,
) {
  manager.on('trackStart', (player) => {
    const snap = playerToSnapshot(player)
    if (!snap.current) {
      return
    }
    const ev: ServerEvent = {
      type: 'trackStart',
      guildId: player.guildId,
      snapshot: snap,
    }
    webLink.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('trackEnd', (player) => {
    const ev: ServerEvent = {
      type: 'trackEnd',
      guildId: player.guildId,
    }
    webLink.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('playerUpdate', (_oldJson, player) => {
    const ev: ServerEvent = {
      type: 'playerUpdate',
      guildId: player.guildId,
      snapshot: playerToSnapshot(player),
    }
    webLink.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('playerClientUpdate', (_old, player) => {
    const ev: ServerEvent = {
      type: 'queueChange',
      guildId: player.guildId,
      length: player.queue.tracks.length + (player.queue.current ? 1 : 0),
    }
    webLink.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('playerDestroy', (player) => {
    const ev: ServerEvent = {
      type: 'playerDestroyed',
      guildId: player.guildId,
    }
    webLink.broadcast(ev)
    botLink.pushServerEvent(ev)
  })
}
