import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('volume')
  .setDescription('Set playback volume')
  .addIntegerOption((o) =>
    o
      .setName('percent')
      .setDescription('Volume from 0 to 100')
      .setRequired(true)
      .setMinValue(0)
      .setMaxValue(100),
  )

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const pct = interaction.options.getInteger('percent', true)
  await ctx.player.setVolume(pct * 10)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.play,
    title: 'Volume Updated',
    description: `Volume is now ${pct}%.`,
  })
}
