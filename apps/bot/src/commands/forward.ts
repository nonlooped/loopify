import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getReadyPlayer, replyMusicError } from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('forward')
  .setDescription('Skip forward in the current track')
  .addIntegerOption((o) =>
    o
      .setName('seconds')
      .setDescription('How many seconds to skip forward')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(3600),
  )

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const sec = interaction.options.getInteger('seconds', true)
  const current = ctx.player.queue.current
  if (!current) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.next,
      title: 'Nothing Playing',
      description: 'There is no active track to seek.',
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
  await ctx.player.seek(ctx.player.position + sec * 1000)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.next,
    title: 'Skipped Forward',
    description: `Moved ahead ${sec} second(s).`,
  })
}
