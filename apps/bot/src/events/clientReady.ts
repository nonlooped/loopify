import { writeFileSync } from 'node:fs'

export const name = 'clientReady'
export const once = true

export async function execute(client: import('discord.js').Client<true>) {
  console.log(`Logged in as ${client.user.tag}`)
  writeFileSync('/tmp/bot-ready', '1')
}
