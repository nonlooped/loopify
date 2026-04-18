import {
  ActionRowBuilder,
  ContainerBuilder,
  type InteractionEditReplyOptions,
  type MessageActionRowComponentBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
} from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { AccentStatus, v2MessageOptions } from '../lib/components-v2.js'
import { createInteractionSession } from '../lib/interaction-sessions.js'
import { editReplyV2Error } from '../music/reply.js'
import {
  buildSearchQuery,
  ensureGuildVoice,
  ensureLavalink,
  getOrCreatePlayer,
  resolveGuildTextChannel,
} from '../services/music-player.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('search')
  .setDescription('Search for tracks and pick one to queue')
  .addStringOption((option) =>
    option.setName('query').setDescription('Search text').setRequired(true),
  )

const MAX_OPTIONS = 10

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

  const queryRaw = interaction.options.getString('query', true)
  const searchQuery = buildSearchQuery(queryRaw)

  await interaction.deferReply()

  const player = await getOrCreatePlayer(
    client,
    voice.guildId,
    voice.voiceChannel,
    resolveGuildTextChannel(interaction),
  )

  try {
    const result = await player.search(searchQuery, interaction.user)

    if (result.loadType === 'empty' || result.loadType === 'error') {
      const detail =
        result.exception?.message ?? 'Nothing matched that request.'
      await editReplyV2Error(interaction, detail)
      return
    }

    const tracks = result.tracks
    if (!tracks.length) {
      await editReplyV2Error(interaction, 'No playable tracks were returned.')
      return
    }

    const slice = tracks.slice(0, MAX_OPTIONS)
    const token = createInteractionSession(
      {
        guildId: voice.guildId,
        userId: interaction.user.id,
        tracks: slice.map((t) => ({
          encoded: t.encoded ?? '',
          info: t.info,
          pluginInfo: t.pluginInfo ?? {},
        })),
      },
      5 * 60_000,
    )

    const options = slice.map((t, i) =>
      new StringSelectMenuOptionBuilder()
        .setLabel((t.info.title ?? 'Track').slice(0, 100))
        .setValue(String(i))
        .setDescription((t.info.author ?? 'Unknown artist').slice(0, 100)),
    )

    const menu = new StringSelectMenuBuilder()
      .setCustomId(`music:search:${token}`)
      .setPlaceholder('Choose a track')
      .addOptions(options)

    const row =
      new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
        menu,
      )

    const container = new ContainerBuilder()
      .setAccentColor(AccentStatus)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${AppEmojis.search} Search Results\n-# Select a track to add it to the queue.`,
        ),
      )
      .addActionRowComponents(row)

    await interaction.editReply(
      v2MessageOptions(container) as InteractionEditReplyOptions,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await editReplyV2Error(interaction, message)
  }
}
