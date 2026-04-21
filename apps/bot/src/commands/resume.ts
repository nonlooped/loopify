import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postResume } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('resume')
  .setDescription('Resume playback')

export const meta = {
  category: 'playback',
  examples: ['/resume'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const r = await postResume(ctx.guildId)
  if (!r.ok) {
    await interaction.reply({ content: await r.text(), ephemeral: true })
    return
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.play,
    title: 'Resumed',
    description: 'Playback has been resumed.',
  })
}
