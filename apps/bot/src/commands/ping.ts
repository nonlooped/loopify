import {
  ContainerBuilder,
  type InteractionEditReplyOptions,
  type InteractionReplyOptions,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { AccentStatus, v2MessageOptions } from '../lib/components-v2.js'

export const data = new SlashCommandBuilder()
  .setName('ping')
  .setDescription("Check the bot's response time to Discord")

export const meta = {
  category: 'info',
  examples: ['/ping'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const measuring = new ContainerBuilder()
    .setAccentColor(AccentStatus)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${AppEmojis.reload} Ping\n-# Measuring…`,
      ),
    )

  const sent = await interaction.reply({
    ...v2MessageOptions(measuring),
    fetchReply: true,
  } as InteractionReplyOptions)

  const roundTrip = sent.createdTimestamp - interaction.createdTimestamp
  const gateway = interaction.client.ws.ping

  const result = new ContainerBuilder()
    .setAccentColor(AccentStatus)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${AppEmojis.reload} Pong\n-# Round-trip **${roundTrip}ms** · Gateway **${gateway}ms**`,
      ),
    )

  await interaction.editReply(
    v2MessageOptions(result) as InteractionEditReplyOptions,
  )
}
