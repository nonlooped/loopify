import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Loop the current song')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const next = ctx.player.repeatMode === 'track' ? 'off' : 'track'
  await ctx.player.setRepeatMode(next)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: next === 'track' ? 'Loop Track On' : 'Loop Track Off',
    description:
      next === 'track'
        ? 'The current song will repeat.'
        : 'Track repeat is disabled.',
  })
}
