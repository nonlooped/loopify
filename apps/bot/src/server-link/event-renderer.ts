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
    const textChannelId = ev.snapshot.textChannelId
    if (!textChannelId) {
      return
    }
    const guild = await client.guilds.fetch(ev.guildId).catch(() => null)
    if (!guild) {
      return
    }
    const channel = await guild.channels.fetch(textChannelId).catch(() => null)
    if (!channel?.isTextBased() || channel.isDMBased()) {
      return
    }
    try {
      const payload = await buildNowPlayingPayload(ev.snapshot, guild)
      await channel.send(payload as never)
    } catch {
      // ignore render/send failures
    }
  })
}
