import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postSkip } from '../server-link/api.js'
import { getReadySnapshot, replyMusicError } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the current track')

export const meta = {
  category: 'playback',
  examples: ['/skip'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const r = await postSkip(ctx.guildId)
  if (!r.ok) {
    await replyMusicError(interaction, 'Nothing to skip.', true)
    return
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.next,
    title: 'Skipped',
    description: 'Skipped to the next track.',
  })
}
