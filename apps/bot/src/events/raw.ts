import type {
  ChannelDeletePacket,
  VoicePacket,
  VoiceServer,
  VoiceState,
} from 'lavalink-client'
import type { BotClient } from '../types/commands.js'

type RawVoiceData = VoicePacket | VoiceServer | VoiceState | ChannelDeletePacket

export const name = 'raw'
export const once = false

export async function execute(client: BotClient, data: unknown) {
  await client.lavalink.sendRawData(data as RawVoiceData)
}
