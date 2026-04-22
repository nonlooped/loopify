import { z } from 'zod'
import { commandInfoSchema, playerSnapshotSchema } from '../types/music.js'

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

export const serverEventPushSchema = z.object({
  type: z.literal('serverEvent'),
  event: serverEventSchema,
})

export const serverToBotMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('gatewaySend'),
    guildId: z.string(),
    payload: z.unknown(),
  }),
  serverEventPushSchema,
])

export const botToServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('botHello'),
    token: z.string(),
  }),
  z.object({
    type: z.literal('rawGateway'),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal('voiceMembership'),
    guildId: z.string(),
    userId: z.string(),
    voiceChannelId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('commandsManifest'),
    commands: z.array(commandInfoSchema),
  }),
])

export type ServerEvent = z.infer<typeof serverEventSchema>
