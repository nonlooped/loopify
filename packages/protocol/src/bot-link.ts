import { z } from 'zod'

import { commandsManifestSchema } from './commands.js'
import { serverEventSchema } from './events.js'

/** Bot identifies on connect */
export const botHelloSchema = z.object({
  type: z.literal('botHello'),
  token: z.string(),
})

/** Web service identifies on connect (INTERNAL_API_TOKEN) */
export const webHelloSchema = z.object({
  type: z.literal('webHello'),
  token: z.string(),
})

/** Raw Discord gateway payload forwarded from bot */
export const rawGatewayEventSchema = z.object({
  type: z.literal('rawGateway'),
  payload: z.unknown(),
})

/** Cached voice membership for access checks */
export const voiceMembershipSchema = z.object({
  type: z.literal('voiceMembership'),
  guildId: z.string(),
  userId: z.string(),
  voiceChannelId: z.string().nullable(),
})

/** Server asks bot to send a gateway payload (e.g. op 4) */
export const gatewaySendSchema = z.object({
  type: z.literal('gatewaySend'),
  guildId: z.string(),
  payload: z.unknown(),
})

export const botToServerMessageSchema = z.discriminatedUnion('type', [
  botHelloSchema,
  rawGatewayEventSchema,
  voiceMembershipSchema,
  commandsManifestSchema,
])

export const serverEventPushSchema = z.object({
  type: z.literal('serverEvent'),
  event: serverEventSchema,
})

export const serverToBotMessageSchema = z.discriminatedUnion('type', [
  gatewaySendSchema,
  serverEventPushSchema,
])

export const webToServerMessageSchema = z.discriminatedUnion('type', [
  webHelloSchema,
  z.object({
    type: z.literal('subscribe'),
    guildIds: z.array(z.string()),
  }),
])

export type BotHello = z.infer<typeof botHelloSchema>
export type RawGatewayEvent = z.infer<typeof rawGatewayEventSchema>
export type VoiceMembership = z.infer<typeof voiceMembershipSchema>
export type GatewaySend = z.infer<typeof gatewaySendSchema>
export type ServerEventPush = z.infer<typeof serverEventPushSchema>
export type BotToServerMessage = z.infer<typeof botToServerMessageSchema>
export type ServerToBotMessage = z.infer<typeof serverToBotMessageSchema>
export type WebToServerMessage = z.infer<typeof webToServerMessageSchema>
