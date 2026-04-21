import { z } from 'zod'

export const accessCheckResultSchema = z.object({
  allowed: z.boolean(),
  voiceChannelId: z.string().nullable(),
  botVoiceChannelId: z.string().nullable(),
})

export type AccessCheckResult = z.infer<typeof accessCheckResultSchema>
