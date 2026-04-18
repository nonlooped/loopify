import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { logScope } from '../../lib/logger.js'
import type { BotClient } from '../../types/commands.js'

export async function loadEvents(client: BotClient, runtimeDir: string) {
  const eventsDir = path.join(runtimeDir, '..', '..', 'events')
  const entries = await readdir(eventsDir, { withFileTypes: true })
  let loadedEvents = 0

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }

    const modulePath = pathToFileURL(path.join(eventsDir, entry.name)).href
    const eventModule = await import(modulePath)
    const handler = (...args: unknown[]) => eventModule.execute(...args)
    if (eventModule.once) {
      client.once(eventModule.name, handler)
    } else {
      client.on(eventModule.name, handler)
    }
    loadedEvents += 1
  }

  logScope('events', `Loaded ${loadedEvents} event modules`)
}
