import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer, replyMusicError } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('skip')
  .setDescription('Skip the current track')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  try {
    await ctx.player.skip()
  } catch {
    await replyMusicError(interaction, 'Nothing to skip.', true)
    return
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.next,
    title: 'Skipped',
    description: 'Skipped to the next track.',
  })
}
