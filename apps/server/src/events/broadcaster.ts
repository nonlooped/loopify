import type { LavalinkManager } from 'lavalink-client'
import type { ServerEvent } from '../contracts/types.js'
import { playerToSnapshot } from '../lavalink/snapshot.js'
import type { BotLink } from '../links/bot-link.js'
import type { EventHub } from '../links/event-hub.js'

export function wireLavalinkEvents(
  manager: LavalinkManager,
  eventHub: EventHub,
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
    eventHub.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('trackEnd', (player) => {
    const ev: ServerEvent = {
      type: 'trackEnd',
      guildId: player.guildId,
    }
    eventHub.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('playerUpdate', (_oldJson, player) => {
    const ev: ServerEvent = {
      type: 'playerUpdate',
      guildId: player.guildId,
      snapshot: playerToSnapshot(player),
    }
    eventHub.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('playerClientUpdate', (_old, player) => {
    const ev: ServerEvent = {
      type: 'queueChange',
      guildId: player.guildId,
      length: player.queue.tracks.length + (player.queue.current ? 1 : 0),
    }
    eventHub.broadcast(ev)
    botLink.pushServerEvent(ev)
  })

  manager.on('playerDestroy', (player) => {
    const ev: ServerEvent = {
      type: 'playerDestroyed',
      guildId: player.guildId,
    }
    eventHub.broadcast(ev)
    botLink.pushServerEvent(ev)
  })
}
