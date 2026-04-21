import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postSeek } from '../server-link/api.js'
import {
  getReadySnapshot,
  parseTimeToMs,
  replyMusicError,
} from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('seek')
  .setDescription('Seek to a position in the current track')
  .addStringOption((o) =>
    o
      .setName('position')
      .setDescription('Time as mm:ss, hh:mm:ss, or seconds')
      .setRequired(true),
  )

export const meta = {
  category: 'playback',
  examples: ['/seek position: 1:23', '/seek position: 90'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const ctx = await getReadySnapshot(interaction)
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
  const current = ctx.snapshot.current
  if (!current) {
    await replyMusicSuccess(interaction, {
      emoji: AppEmojis.play,
      title: 'Nothing Playing',
      description: 'There is no active track to seek.',
    })
    return
  }
  await interaction.deferReply()
  await postSeek(ctx.guildId, ms)
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.play,
    title: 'Seeked',
    description: `Seeked to ${raw.trim()}.`,
  })
}
