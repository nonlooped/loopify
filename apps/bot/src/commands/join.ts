import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import {
  ensureGuildVoice,
  ensureLavalink,
  getOrCreatePlayer,
  resolveGuildTextChannel,
} from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join the voice channel you are in')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const voice = await ensureGuildVoice(interaction)
  if (!voice.ok) {
    return
  }
  if (!(await ensureLavalink(interaction, client))) {
    return
  }
  await getOrCreatePlayer(
    client,
    voice.guildId,
    voice.voiceChannel,
    resolveGuildTextChannel(interaction),
  )
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.play,
    title: 'Joined Voice',
    description: `Connected to ${voice.voiceChannel.name}.`,
  })
}
