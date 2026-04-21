import { getMusicServerConnection } from '../server-link/connection.js'
import type { BotClient } from '../types/commands.js'

export const name = 'raw'
export const once = false

export async function execute(_client: BotClient, data: unknown) {
  getMusicServerConnection()?.sendRawGateway(data)
}
