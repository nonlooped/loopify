import { buildNowPlayingPayload } from '../music/payloads.js'
import type { BotClient } from '../types/commands.js'

import type { MusicServerConnection } from './connection.js'

export function registerTrackStartAnnouncer(
  client: BotClient,
  conn: MusicServerConnection,
) {
  conn.onServerEvent(async (ev) => {
    if (ev.type !== 'trackStart') {
      return
    }
    const tid = ev.snapshot.textChannelId
    if (!tid) {
      return
    }
    const guild = await client.guilds.fetch(ev.guildId).catch(() => null)
    if (!guild) {
      return
    }
    const ch = await guild.channels.fetch(tid).catch(() => null)
    if (!ch?.isTextBased() || ch.isDMBased()) {
      return
    }
    try {
      const payload = await buildNowPlayingPayload(ev.snapshot, guild)
      await ch.send(payload as never)
    } catch {
      /* ignore */
    }
  })
}
