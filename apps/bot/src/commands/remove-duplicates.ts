import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { deleteQueueIndex } from '../server-link/api.js'
import { getReadySnapshot, trackDedupeKey } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('remove-duplicates')
  .setDescription('Remove duplicate songs from the queue')

export const meta = {
  category: 'queue',
  examples: ['/remove-duplicates'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const seen = new Set<string>()
  const duplicateIndexes: number[] = []
  const { queue } = ctx.snapshot
  for (let i = 0; i < queue.length; i++) {
    const key = trackDedupeKey(queue[i])
    if (seen.has(key)) {
      duplicateIndexes.push(i)
    } else {
      seen.add(key)
    }
  }
  for (const idx of duplicateIndexes.sort((a, b) => b - a)) {
    await deleteQueueIndex(ctx.guildId, idx)
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Duplicates Removed',
    description:
      duplicateIndexes.length > 0
        ? `Removed ${duplicateIndexes.length} duplicate track(s) from the queue.`
        : 'No duplicate tracks were found.',
  })
}
