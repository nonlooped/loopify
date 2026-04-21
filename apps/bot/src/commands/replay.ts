import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postSeek } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('replay')
  .setDescription('Restart the current track from the beginning')

export const meta = {
  category: 'playback',
  examples: ['/replay'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const current = ctx.snapshot.current
  if (!current) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.reload,
      title: 'Nothing Playing',
      description: 'There is no active track.',
    })
    return
  }
  await interaction.deferReply()
  await postSeek(ctx.guildId, 0)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Replay',
    description: 'Started the current track from the beginning.',
  })
}
