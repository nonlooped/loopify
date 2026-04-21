import { z } from 'zod'

import { loopModeSchema } from './player.js'

export const playBodySchema = z.object({
  query: z.string(),
  voiceChannelId: z.string(),
  textChannelId: z.string().optional(),
  requesterId: z.string(),
})

export const pauseBodySchema = z
  .object({
    paused: z.boolean().optional(),
  })
  .optional()

export const seekBodySchema = z.object({
  positionMs: z.number(),
})

export const volumeBodySchema = z.object({
  volume: z.number().min(0).max(1000),
})

export const filtersBodySchema = z.record(z.unknown())

export const loopBodySchema = z.object({
  mode: loopModeSchema,
})

export const shuffleBodySchema = z.object({}).optional()

export const clearBodySchema = z.object({}).optional()

export const skipBodySchema = z.object({}).optional()

export const addToQueueBodySchema = z.object({
  encoded: z.string(),
  requesterId: z.string(),
  position: z.number().optional(),
})

export const moveQueueBodySchema = z.object({
  from: z.number(),
  to: z.number(),
})

export type PlayBody = z.infer<typeof playBodySchema>
export type PauseBody = z.infer<typeof pauseBodySchema>
export type SeekBody = z.infer<typeof seekBodySchema>
export type VolumeBody = z.infer<typeof volumeBodySchema>
export type FiltersBody = z.infer<typeof filtersBodySchema>
export type LoopBody = z.infer<typeof loopBodySchema>
export type AddToQueueBody = z.infer<typeof addToQueueBodySchema>
export type MoveQueueBody = z.infer<typeof moveQueueBodySchema>

export const commandOptionSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.number(),
  required: z.boolean().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  choices: z
    .array(
      z.object({
        name: z.string(),
        value: z.union([z.string(), z.number()]),
      }),
    )
    .optional(),
})

export const commandCategorySchema = z.enum([
  'playback',
  'queue',
  'voice',
  'info',
  'other',
])

export const commandInfoSchema = z.object({
  name: z.string(),
  description: z.string(),
  category: commandCategorySchema.default('other'),
  examples: z.array(z.string()).default([]),
  options: z.array(commandOptionSchema).default([]),
})

export const commandsManifestSchema = z.object({
  type: z.literal('commandsManifest'),
  commands: z.array(commandInfoSchema),
})

export type CommandOption = z.infer<typeof commandOptionSchema>
export type CommandCategory = z.infer<typeof commandCategorySchema>
export type CommandInfo = z.infer<typeof commandInfoSchema>
export type CommandsManifest = z.infer<typeof commandsManifestSchema>
