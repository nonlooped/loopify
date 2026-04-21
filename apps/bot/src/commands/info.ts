import {
  ContainerBuilder,
  type InteractionReplyOptions,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { AccentRich, v2MessageOptions } from '../lib/components-v2.js'

export const data = new SlashCommandBuilder()
  .setName('info')
  .setDescription('Learn about Loopify')

export const meta = {
  category: 'info',
  examples: ['/info'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const container = new ContainerBuilder()
    .setAccentColor(AccentRich)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `### ${AppEmojis.crown1} Loopify`,
          'A Discord music bot.',
          '',
          '-# [Repository](https://github.com/unloopedmido/loopify) · [Issues](https://github.com/unloopedmido/loopify/issues)',
        ].join('\n'),
      ),
    )

  await interaction.reply(
    v2MessageOptions(container) as InteractionReplyOptions,
  )
}
