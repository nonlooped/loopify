import {
  type InteractionEditReplyOptions,
  SlashCommandBuilder,
} from 'discord.js'

import { buildNowPlayingPayload } from '../music/payloads.js'
import { replyMusicSuccess } from '../music/reply.js'
import { getPlayerSnapshot } from '../server-link/api.js'
import { ensureMusicServer, replyMusicError } from '../services/music-player.js'

export const data = new SlashCommandBuilder()
  .setName('now-playing')
  .setDescription('Show the currently playing track')

export const meta = {
  category: 'playback',
  examples: ['/now-playing'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await replyMusicError(
      interaction,
      'This command can only be used in a server.',
      true,
    )
    return
  }
  if (!(await ensureMusicServer(interaction))) {
    return
  }
  await interaction.deferReply()
  const snap = await getPlayerSnapshot(interaction.guildId)
  if (!snap) {
    await replyMusicSuccess(interaction, {
      title: 'Nothing Playing',
      description: 'There is no active music session in this server.',
    })
    return
  }
  const payload = await buildNowPlayingPayload(snap, interaction.guild)
  await interaction.editReply(payload as InteractionEditReplyOptions)
}
