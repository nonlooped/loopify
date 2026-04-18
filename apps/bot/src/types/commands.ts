import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Collection,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  UserContextMenuCommandInteraction,
} from 'discord.js'

import type { LavalinkManager } from 'lavalink-client'

export type AnyExecutableCommandInteraction =
  | ChatInputCommandInteraction
  | UserContextMenuCommandInteraction
  | MessageContextMenuCommandInteraction

export interface CommandModule {
  data: SlashCommandBuilder | ContextMenuCommandBuilder
  execute: (
    interaction: AnyExecutableCommandInteraction,
  ) => Promise<void> | void
  /** Optional: slash commands with `.setAutocomplete(true)` options. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void> | void
}

export type BotClient = import('discord.js').Client & {
  commands: Collection<string, CommandModule>
  lavalink: LavalinkManager
}
