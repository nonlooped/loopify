import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postLoop } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('loop-queue')
  .setDescription('Loop the entire queue')

export const meta = {
  category: 'queue',
  examples: ['/loop-queue'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const next = ctx.snapshot.repeatMode === 'queue' ? 'off' : 'queue'
  await postLoop(ctx.guildId, next)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: next === 'queue' ? 'Queue Loop On' : 'Queue Loop Off',
    description:
      next === 'queue'
        ? 'The queue will repeat when it ends.'
        : 'Queue loop is disabled.',
  })
}
