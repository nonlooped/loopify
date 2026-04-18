import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('loop-queue')
  .setDescription('Loop the entire queue')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const next = ctx.player.repeatMode === 'queue' ? 'off' : 'queue'
  await ctx.player.setRepeatMode(next)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: next === 'queue' ? 'Queue Loop On' : 'Queue Loop Off',
    description:
      next === 'queue'
        ? 'The queue will repeat when it ends.'
        : 'Queue loop is disabled.',
  })
}
