import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postPause } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('pause')
  .setDescription('Pause the current track')

export const meta = {
  category: 'playback',
  examples: ['/pause'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const r = await postPause(ctx.guildId, { paused: true })
  if (!r.ok) {
    const err = await r.text()
    await interaction.reply({ content: err, ephemeral: true })
    return
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.pause,
    title: 'Song Paused',
    description: 'Playback has been paused.',
  })
}
