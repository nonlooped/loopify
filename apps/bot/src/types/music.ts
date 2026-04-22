import { z } from 'zod'

export const loopModeSchema = z.enum(['off', 'track', 'queue'])
export type LoopMode = z.infer<typeof loopModeSchema>

export const trackInfoSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  duration: z.number().optional(),
  uri: z.string().optional(),
  identifier: z.string().optional(),
  artworkUrl: z.string().optional(),
})

export const queueItemSchema = z.object({
  encoded: z.string().optional(),
  requesterId: z.string().nullable().optional(),
  requesterName: z.string().optional(),
  requesterAvatarUrl: z.string().optional(),
  info: trackInfoSchema,
})

export const playerSnapshotSchema = z.object({
  guildId: z.string(),
  voiceChannelId: z.string().nullable(),
  textChannelId: z.string().nullable(),
  position: z.number(),
  paused: z.boolean(),
  playing: z.boolean(),
  volume: z.number(),
  repeatMode: loopModeSchema,
  current: queueItemSchema.nullable(),
  queue: z.array(queueItemSchema),
  ping: z
    .object({
      ws: z.number(),
      lavalink: z.number(),
    })
    .optional(),
})

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

export type QueueItem = z.infer<typeof queueItemSchema>
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>
export type CommandOption = z.infer<typeof commandOptionSchema>
export type CommandCategory = z.infer<typeof commandCategorySchema>
export type CommandInfo = z.infer<typeof commandInfoSchema>
