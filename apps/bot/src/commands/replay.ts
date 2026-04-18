import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer, replyMusicError } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('replay')
  .setDescription('Restart the current track from the beginning')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const current = ctx.player.queue.current
  if (!current) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.reload,
      title: 'Nothing Playing',
      description: 'There is no active track.',
    })
    return
  }
  if (!current.info.isSeekable || current.info.isStream) {
    await replyMusicError(
      interaction,
      'This track cannot be seeked (live stream or not seekable).',
      true,
    )
    return
  }
  await interaction.deferReply()
  await ctx.player.seek(0)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.reload,
    title: 'Replay',
    description: 'Started the current track from the beginning.',
  })
}
