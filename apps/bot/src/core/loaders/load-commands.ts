import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { logScope } from '../../lib/logger.js'
import type { BotClient } from '../../types/commands.js'

export async function loadCommands(client: BotClient) {
  const loadersDir = path.dirname(fileURLToPath(import.meta.url))
  const commandsDir = path.join(loadersDir, '..', '..', 'commands')
  const entries = await readdir(commandsDir, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) {
      continue
    }

    const modulePath = pathToFileURL(path.join(commandsDir, entry.name)).href
    const commandModule = await import(modulePath)
    const name = commandModule.data.name
    if (client.commands.has(name)) {
      logScope(
        'commands',
        `Duplicate slash command name "${name}" (${entry.name} overwrites a previous module)`,
      )
    }
    client.commands.set(name, commandModule)
  }

  logScope('commands', `Loaded ${client.commands.size} command modules`)
}
