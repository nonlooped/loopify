import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import {
  getReadyPlayer,
  parseTimeToMs,
  replyMusicError,
} from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('seek')
  .setDescription('Seek to a position in the current track')
  .addStringOption((o) =>
    o
      .setName('position')
      .setDescription('Time as mm:ss, hh:mm:ss, or seconds')
      .setRequired(true),
  )

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const ctx = await getReadyPlayer(interaction, client)
  if (!ctx.ok) {
    return
  }
  const raw = interaction.options.getString('position', true)
  const ms = parseTimeToMs(raw)
  if (ms == null) {
    await replyMusicError(
      interaction,
      'Could not parse that time. Use seconds, mm:ss, or hh:mm:ss.',
      true,
    )
    return
  }
  const current = ctx.player.queue.current
  if (!current) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.play,
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
  await ctx.player.seek(ms)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.play,
    title: 'Seeked',
    description: `Seeked to ${raw.trim()}.`,
  })
}
