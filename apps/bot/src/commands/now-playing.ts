import {
  type InteractionEditReplyOptions,
  SlashCommandBuilder,
} from 'discord.js'
import { buildNowPlayingPayload } from '../music/payloads.js'
import { replyMusicSuccess } from '../music/reply.js'
import {
  ensureLavalink,
  getPlayer,
  replyMusicError,
} from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('now-playing')
  .setDescription('Show the currently playing track')

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  if (!interaction.inGuild() || !interaction.guildId || !interaction.guild) {
    await replyMusicError(
      interaction,
      'This command can only be used in a server.',
      true,
    )
    return
  }
  if (!(await ensureLavalink(interaction, client))) {
    return
  }
  await interaction.deferReply()
  const player = getPlayer(client, interaction.guildId)
  if (!player) {
    await replyMusicSuccess(interaction, {
      title: 'Nothing Playing',
      description: 'There is no active music session in this server.',
    })
    return
  }
  const payload = await buildNowPlayingPayload(player, interaction.guild)
  await interaction.editReply(payload as InteractionEditReplyOptions)
}
