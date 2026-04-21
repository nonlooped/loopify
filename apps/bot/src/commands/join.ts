import { SlashCommandBuilder } from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { replyMusicSuccess } from '../music/reply.js'
import { postJoin } from '../server-link/api.js'
import {
  ensureGuildVoice,
  ensureMusicServer,
  resolveGuildTextChannel,
} from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join the voice channel you are in')

export const meta = {
  category: 'voice',
  examples: ['/join'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const voice = await ensureGuildVoice(interaction)
  if (!voice.ok) {
    return
  }
  if (!(await ensureMusicServer(interaction))) {
    return
  }
  const textCh = resolveGuildTextChannel(interaction)
  const r = await postJoin(voice.guildId, {
    voiceChannelId: voice.voiceChannel.id,
    textChannelId: textCh?.id,
  })
  if (!r.ok) {
    await interaction.reply({ content: await r.text(), ephemeral: true })
    return
  }
  await replyMusicSuccess(interaction, {
    emoji: AppEmojis.play,
    title: 'Joined Voice',
    description: `Connected to ${voice.voiceChannel.name}.`,
  })
}
