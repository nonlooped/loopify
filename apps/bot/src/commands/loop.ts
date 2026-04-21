import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postLoop } from '../server-link/api.js'
import { getReadySnapshot } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('loop')
  .setDescription('Loop the current song')

export const meta = {
  category: 'queue',
  examples: ['/loop'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const next = ctx.snapshot.repeatMode === 'track' ? 'off' : 'track'
  await postLoop(ctx.guildId, next)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: next === 'track' ? 'Loop Track On' : 'Loop Track Off',
    description:
      next === 'track'
        ? 'The current song will repeat.'
        : 'Track repeat is disabled.',
  })
}
