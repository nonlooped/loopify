import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postVolume } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

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

export const meta = {
  category: 'playback',
  examples: ['/volume percent: 50'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const pct = interaction.options.getInteger('percent', true)
  await postVolume(ctx.guildId, pct * 10)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.play,
    title: 'Volume Updated',
    description: `Volume is now ${pct}%.`,
  })
}
