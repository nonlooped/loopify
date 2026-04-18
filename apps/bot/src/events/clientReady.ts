import { writeFileSync } from 'node:fs'
import type { BotClient } from '../types/commands.js'

export const name = 'clientReady'
export const once = true

export async function execute(client: BotClient) {
  if (!client.user) return

  console.log(`Logged in as ${client.user.tag}`)
  writeFileSync('/tmp/bot-ready', '1')

  await client.lavalink.init({
    id: client.user.id,
    username: client.user.username,
  })
}
