import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { logScope } from '../../lib/logger.js'
import type { BotClient } from '../../types/commands.js'

export async function loadCommands(client: BotClient, runtimeDir: string) {
  const commandsDir = path.join(runtimeDir, '..', '..', 'commands')
  const entries = await readdir(commandsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }

    const modulePath = pathToFileURL(path.join(commandsDir, entry.name)).href
    const commandModule = await import(modulePath)
    client.commands.set(commandModule.data.name, commandModule)
  }

  logScope('commands', `Loaded ${client.commands.size} command modules`)
}
