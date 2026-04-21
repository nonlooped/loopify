import {
  ContainerBuilder,
  type InteractionReplyOptions,
  SlashCommandBuilder,
  TextDisplayBuilder,
} from 'discord.js'

import { AppEmojis } from '../lib/app-emojis.js'
import { AccentStatus, v2MessageOptions } from '../lib/components-v2.js'
import type { BotClient } from '../types/commands.js'

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Shows available commands and their descriptions')

export const meta = {
  category: 'info',
  examples: ['/help'],
} as const

export async function execute(
  interaction: import('discord.js').ChatInputCommandInteraction,
) {
  const client = interaction.client as BotClient
  const lines = [...client.commands.values()]
    .map((cmd) => {
      const json = cmd.data.toJSON() as {
        name: string
        description?: string
        type?: number
      }
      if (json.type !== undefined && json.type !== 1) {
        return null
      }
      const desc = json.description?.trim() ?? ''
      return desc ? `**/${json.name}** — ${desc}` : `**/${json.name}**`
    })
    .filter((line): line is string => line != null)
    .sort((a, b) => a.localeCompare(b))

  const body = lines.length ? lines.join('\n') : '_No commands are registered._'

  const container = new ContainerBuilder()
    .setAccentColor(AccentStatus)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `### ${AppEmojis.settings} Help\n-# Available slash commands\n\n${body}`,
      ),
    )

  await interaction.reply({
    ...v2MessageOptions(container),
    ephemeral: true,
  } as InteractionReplyOptions)
}
