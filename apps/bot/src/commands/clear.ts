import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postClear } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Clear the upcoming tracks in the queue')

export const meta = {
  category: 'queue',
  examples: ['/clear'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const n = ctx.snapshot.queue.length
  await postClear(ctx.guildId)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Queue Cleared',
    description:
      n > 0
        ? `Removed ${n} upcoming track(s). The current track keeps playing.`
        : 'The queue was already empty.',
  })
}
