import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer, trackDedupeKey } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('remove-duplicates')
  .setDescription('Remove duplicate songs from the queue')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const { queue } = ctx.player
  const seen = new Set<string>()
  const duplicateIndexes: number[] = []
  for (let i = 0; i < queue.tracks.length; i++) {
    const key = trackDedupeKey(queue.tracks[i])
    if (seen.has(key)) {
      duplicateIndexes.push(i)
    } else {
      seen.add(key)
    }
  }
  for (const idx of duplicateIndexes.sort((a, b) => b - a)) {
    await queue.remove(idx)
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
