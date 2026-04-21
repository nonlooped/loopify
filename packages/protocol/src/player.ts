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
  info: trackInfoSchema,
})

export const filterStateSchema = z
  .object({
    volume: z.number().optional(),
  })
  .passthrough()

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

export type TrackInfo = z.infer<typeof trackInfoSchema>
export type QueueItem = z.infer<typeof queueItemSchema>
export type FilterState = z.infer<typeof filterStateSchema>
export type PlayerSnapshot = z.infer<typeof playerSnapshotSchema>
