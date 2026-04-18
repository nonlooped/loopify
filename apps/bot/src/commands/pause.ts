import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause the current track')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  await ctx.player.pause()
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.pause,
    title: 'Song Paused',
    description: 'Playback has been paused.',
  })
}
