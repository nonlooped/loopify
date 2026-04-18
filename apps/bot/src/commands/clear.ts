import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('clear')
  .setDescription('Clear the upcoming tracks in the queue')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const n = ctx.player.queue.tracks.length
  if (n > 0) {
    await ctx.player.queue.splice(0, n)
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Queue Cleared',
    description:
      n > 0
        ? `Removed ${n} upcoming track(s). The current track keeps playing.`
        : 'The queue was already empty.',
  })
}
