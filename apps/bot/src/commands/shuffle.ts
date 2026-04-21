import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postShuffle } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('shuffle')
  .setDescription('Shuffle the queue')

export const meta = {
  category: 'queue',
  examples: ['/shuffle'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  await postShuffle(ctx.guildId)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Shuffled',
    description: 'The queue has been shuffled.',
  })
}
