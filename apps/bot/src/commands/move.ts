import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postQueueMove } from '../server-link/api.js'
import { getReadySnapshot, replyMusicError } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('move')
  .setDescription('Move a song to another position in the queue')
  .addIntegerOption((o) =>
    o
      .setName('from')
      .setDescription('Current position in the queue (1 = next up)')
      .setRequired(true)
      .setMinValue(1),
  )
  .addIntegerOption((o) =>
    o
      .setName('to')
      .setDescription('Target position in the queue')
      .setRequired(true)
      .setMinValue(1),
  )

export const meta = {
  category: 'queue',
  examples: ['/move from: 3 to: 1'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
  if (!ctx.ok) {
    return
  }
  const from = interaction.options.getInteger('from', true)
  const to = interaction.options.getInteger('to', true)
  const len = ctx.snapshot.queue.length
  if (len === 0) {
    await replyMusicError(interaction, 'The queue is empty.', true)
    return
  }
  if (from > len || to > len) {
    await replyMusicError(
      interaction,
      `Positions must be between 1 and ${len}.`,
      true,
    )
    return
  }
  if (from === to) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.reload,
      title: 'No Change',
      description: 'Source and target positions are the same.',
    })
    return
  }
  const fromIdx = from - 1
  const toIdx = to - 1
  await postQueueMove(ctx.guildId, { from: fromIdx, to: toIdx })
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Track Moved',
    description: `Moved from #${from} to #${to}.`,
  })
}
