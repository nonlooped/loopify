import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postStop } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('stop')
  .setDescription('Disconnect from the voice channel and stop playback')

export const meta = {
  category: 'playback',
  examples: ['/stop'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  await postStop(ctx.guildId)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.cancel,
    title: 'Song Stopped',
    description:
      'Playback was stopped and the bot disconnected from the voice channel.',
  })
}
