import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { assertRequiredEnv } from '../../config/env.js'
import { registerInteractionHandlers } from '../../interactions/router.js'
import { logScope } from '../../lib/logger.js'
import { createClient } from '../client/create-client.js'
import { loadCommands } from '../loaders/load-commands.js'
import { loadEvents } from '../loaders/load-events.js'
import { syncCommands } from './sync-commands.js'

config()

export async function startBot() {
  const client = createClient()
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)

  await loadCommands(client, __dirname)
  await syncCommands(client)
  await loadEvents(client, __dirname)
  await registerInteractionHandlers(client)

  logScope('runtime', 'Starting Discord client')
  await client.login(assertRequiredEnv('DISCORD_TOKEN'))
}
