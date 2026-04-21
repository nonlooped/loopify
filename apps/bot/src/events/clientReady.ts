import { writeFileSync } from 'node:fs'
import type { BotClient } from '../types/commands.js'

export const name = 'clientReady'
export const once = true

export async function execute(client: BotClient, ..._args: unknown[]) {
  if (!client.user) {
    return
  }

  console.log(`Logged in as ${client.user.tag}`)
  writeFileSync('/tmp/bot-ready', '1')
}
