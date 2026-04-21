import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { CommandInfo, CommandOption } from '@loopify/protocol'
import { logScope } from '../../lib/logger.js'
import type { BotClient, CommandMeta } from '../../types/commands.js'

type RawCommandOption = {
  name: string
  description: string
  type: number
  required?: boolean
  min_value?: number
  max_value?: number
  choices?: Array<{ name: string; value: string | number }>
}

type RawCommandJson = {
  name: string
  description?: string
  type?: number
  options?: RawCommandOption[]
}

function toCommandOption(raw: RawCommandOption): CommandOption {
  const option: CommandOption = {
    name: raw.name,
    description: raw.description,
    type: raw.type,
  }
  if (raw.required !== undefined) {
    option.required = raw.required
  }
  if (raw.min_value !== undefined) {
    option.minValue = raw.min_value
  }
  if (raw.max_value !== undefined) {
    option.maxValue = raw.max_value
  }
  if (raw.choices && raw.choices.length > 0) {
    option.choices = raw.choices.map((choice) => ({
      name: choice.name,
      value: choice.value,
    }))
  }
  return option
}

function buildCommandInfo(
  json: RawCommandJson,
  meta: CommandMeta | undefined,
): CommandInfo | null {
  if (json.type !== undefined && json.type !== 1) {
    return null
  }
  return {
    name: json.name,
    description: json.description ?? '',
    category: meta?.category ?? 'other',
    examples: meta?.examples ?? [],
    options: (json.options ?? []).map(toCommandOption),
  }
}

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

  const manifest: CommandInfo[] = []
  for (const cmd of client.commands.values()) {
    const json = cmd.data.toJSON() as RawCommandJson
    const info = buildCommandInfo(json, cmd.meta)
    if (info) {
      manifest.push(info)
    }
  }
  manifest.sort((a, b) => a.name.localeCompare(b.name))
  client.commandsManifest = manifest

  logScope('commands', `Loaded ${client.commands.size} command modules`)
}
