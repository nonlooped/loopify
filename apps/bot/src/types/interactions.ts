import type {
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js'

/** Optional: higher values run before other flex routes (same kind). */
export type InteractionRoutePriority = {
  interactionRoutePriority?: number
}

/** Full customId string match (static components). */
export type ExactModalModule = InteractionRoutePriority & {
  customId: string
  customIdRegExp?: undefined
  parseCustomId?: undefined
  matchCustomId?: undefined
  execute: (interaction: ModalSubmitInteraction) => Promise<void> | void
}

/** Entire customId must match; `execute` receives `RegExp.prototype.exec` result. */
export type RegexpModalModule = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp: RegExp
  parseCustomId?: undefined
  matchCustomId?: undefined
  execute: (
    interaction: ModalSubmitInteraction,
    match: RegExpExecArray,
  ) => Promise<void> | void
}

/** Return non-null from `parseCustomId` to route; value is passed to `execute`. */
export type ParseModalModule<TParsed = unknown> = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp?: undefined
  matchCustomId?: undefined
  parseCustomId: (customId: string) => TParsed | null
  execute: (
    interaction: ModalSubmitInteraction,
    parsed: TParsed,
  ) => Promise<void> | void
}

/** Boolean match — use `interaction.customId` inside `execute` for parsing. */
export type MatchModalModule = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp?: undefined
  parseCustomId?: undefined
  matchCustomId: (customId: string) => boolean
  execute: (interaction: ModalSubmitInteraction) => Promise<void> | void
}

export type ModalInteractionModule =
  | ExactModalModule
  | RegexpModalModule
  | ParseModalModule
  | MatchModalModule

export type ExactButtonModule = InteractionRoutePriority & {
  customId: string
  customIdRegExp?: undefined
  parseCustomId?: undefined
  matchCustomId?: undefined
  execute: (interaction: ButtonInteraction) => Promise<void> | void
}

export type RegexpButtonModule = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp: RegExp
  parseCustomId?: undefined
  matchCustomId?: undefined
  execute: (
    interaction: ButtonInteraction,
    match: RegExpExecArray,
  ) => Promise<void> | void
}

export type ParseButtonModule<TParsed = unknown> = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp?: undefined
  matchCustomId?: undefined
  parseCustomId: (customId: string) => TParsed | null
  execute: (
    interaction: ButtonInteraction,
    parsed: TParsed,
  ) => Promise<void> | void
}

export type MatchButtonModule = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp?: undefined
  parseCustomId?: undefined
  matchCustomId: (customId: string) => boolean
  execute: (interaction: ButtonInteraction) => Promise<void> | void
}

export type ButtonInteractionModule =
  | ExactButtonModule
  | RegexpButtonModule
  | ParseButtonModule
  | MatchButtonModule

export type ExactStringSelectModule = InteractionRoutePriority & {
  customId: string
  customIdRegExp?: undefined
  parseCustomId?: undefined
  matchCustomId?: undefined
  execute: (interaction: StringSelectMenuInteraction) => Promise<void> | void
}

export type RegexpStringSelectModule = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp: RegExp
  parseCustomId?: undefined
  matchCustomId?: undefined
  execute: (
    interaction: StringSelectMenuInteraction,
    match: RegExpExecArray,
  ) => Promise<void> | void
}

export type ParseStringSelectModule<TParsed = unknown> =
  InteractionRoutePriority & {
    customId?: undefined
    customIdRegExp?: undefined
    matchCustomId?: undefined
    parseCustomId: (customId: string) => TParsed | null
    execute: (
      interaction: StringSelectMenuInteraction,
      parsed: TParsed,
    ) => Promise<void> | void
  }

export type MatchStringSelectModule = InteractionRoutePriority & {
  customId?: undefined
  customIdRegExp?: undefined
  parseCustomId?: undefined
  matchCustomId: (customId: string) => boolean
  execute: (interaction: StringSelectMenuInteraction) => Promise<void> | void
}

export type StringSelectInteractionModule =
  | ExactStringSelectModule
  | RegexpStringSelectModule
  | ParseStringSelectModule
  | MatchStringSelectModule
