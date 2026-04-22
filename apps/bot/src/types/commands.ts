import type {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  Collection,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
  UserContextMenuCommandInteraction,
} from 'discord.js'
import type { CommandCategory, CommandInfo } from './music.js'

export type AnyExecutableCommandInteraction =
  | ChatInputCommandInteraction
  | UserContextMenuCommandInteraction
  | MessageContextMenuCommandInteraction

export interface CommandMeta {
  category: CommandCategory
  examples?: string[]
}

export interface CommandModule {
  data: SlashCommandBuilder | ContextMenuCommandBuilder
  execute: (
    interaction: AnyExecutableCommandInteraction,
  ) => Promise<void> | void
  /** Optional: slash commands with `.setAutocomplete(true)` options. */
  autocomplete?: (interaction: AutocompleteInteraction) => Promise<void> | void
  /** Optional: static metadata for public docs surfaces (e.g. web /commands). */
  meta?: CommandMeta
}

export type BotClient = import('discord.js').Client & {
  commands: Collection<string, CommandModule>
  commandsManifest?: CommandInfo[]
}
