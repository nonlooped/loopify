import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Disconnect from the voice channel and stop playback')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  await ctx.player.destroy()
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.cancel,
    title: 'Song Stopped',
    description:
      'Playback was stopped and the bot disconnected from the voice channel.',
  })
}
