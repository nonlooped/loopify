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

export type QueueItem = z.infer<typeof queueItemSchema>
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>

export const pauseBodySchema = z
  .object({
    paused: z.boolean().optional(),
  })
  .optional()

export const playBodySchema = z.object({
  query: z.string(),
  voiceChannelId: z.string(),
  textChannelId: z.string().optional(),
  requesterId: z.string(),
  requesterName: z.string().optional(),
  requesterAvatarUrl: z.string().optional(),
})

export const seekBodySchema = z.object({
  positionMs: z.number(),
})

export const volumeBodySchema = z.object({
  volume: z.number().min(0).max(1000),
})

export const loopBodySchema = z.object({
  mode: loopModeSchema,
})

export const addToQueueBodySchema = z.object({
  encoded: z.string(),
  requesterId: z.string(),
  requesterName: z.string().optional(),
  requesterAvatarUrl: z.string().optional(),
  position: z.number().optional(),
})

export const moveQueueBodySchema = z.object({
  from: z.number(),
  to: z.number(),
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

export type CommandOption = z.infer<typeof commandOptionSchema>
export type CommandCategory = z.infer<typeof commandCategorySchema>
export type CommandInfo = z.infer<typeof commandInfoSchema>

export const serverEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('playerUpdate'),
    guildId: z.string(),
    snapshot: playerSnapshotSchema.partial().optional(),
  }),
  z.object({
    type: z.literal('trackStart'),
    guildId: z.string(),
    snapshot: playerSnapshotSchema,
  }),
  z.object({
    type: z.literal('trackEnd'),
    guildId: z.string(),
    reason: z.string().optional(),
  }),
  z.object({
    type: z.literal('queueChange'),
    guildId: z.string(),
    length: z.number(),
  }),
  z.object({
    type: z.literal('voiceStateUpdate'),
    guildId: z.string(),
    userId: z.string(),
    voiceChannelId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('playerDestroyed'),
    guildId: z.string(),
    reason: z.string().optional(),
  }),
])

export type ServerEvent = z.infer<typeof serverEventSchema>

export const botHelloSchema = z.object({
  type: z.literal('botHello'),
  token: z.string(),
})

export const rawGatewayEventSchema = z.object({
  type: z.literal('rawGateway'),
  payload: z.unknown(),
})

export const voiceMembershipSchema = z.object({
  type: z.literal('voiceMembership'),
  guildId: z.string(),
  userId: z.string(),
  voiceChannelId: z.string().nullable(),
})

export const commandsManifestSchema = z.object({
  type: z.literal('commandsManifest'),
  commands: z.array(commandInfoSchema),
})

export const gatewaySendSchema = z.object({
  type: z.literal('gatewaySend'),
  guildId: z.string(),
  payload: z.unknown(),
})

export const serverEventPushSchema = z.object({
  type: z.literal('serverEvent'),
  event: serverEventSchema,
})

export const botToServerMessageSchema = z.discriminatedUnion('type', [
  botHelloSchema,
  rawGatewayEventSchema,
  voiceMembershipSchema,
  commandsManifestSchema,
])

export const serverToBotMessageSchema = z.discriminatedUnion('type', [
  gatewaySendSchema,
  serverEventPushSchema,
])
