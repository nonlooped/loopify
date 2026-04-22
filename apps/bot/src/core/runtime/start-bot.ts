import { assertRequiredEnv } from '../../config/env.js'
import { registerInteractionHandlers } from '../../interactions/router.js'
import { logScope } from '../../lib/logger.js'
import { initMusicServerConnection } from '../../server-link/connection.js'
import { registerTrackStartAnnouncer } from '../../server-link/event-renderer.js'
import { createClient } from '../client/create-client.js'
import { loadCommands } from '../loaders/load-commands.js'
import { loadEvents } from '../loaders/load-events.js'
import { syncCommands } from './sync-commands.js'

export async function startBot() {
  const client = createClient()

  await loadCommands(client)
  await syncCommands(client)
  await loadEvents(client)
  await registerInteractionHandlers(client)

  logScope('runtime', 'Starting Discord client')
  await client.login(assertRequiredEnv('DISCORD_TOKEN'))

  const conn = initMusicServerConnection(client)
  registerTrackStartAnnouncer(client, conn)
}
