import { REST, Routes } from 'discord.js'
import { assertRequiredEnv } from '../../config/env.js'
import { logScope } from '../../lib/logger.js'
import type { BotClient } from '../../types/commands.js'

export async function syncCommands(client: BotClient) {
  const commandPayload = [...client.commands.values()].map((command) =>
    command.data.toJSON(),
  )
  const token = assertRequiredEnv('DISCORD_TOKEN')
  const clientId = assertRequiredEnv('CLIENT_ID')
  const rest = new REST({ version: '10' }).setToken(token)

  if (process.env.NODE_ENV === 'production') {
    await rest.put(Routes.applicationCommands(clientId), {
      body: commandPayload,
    })
    logScope('commands', `Synced ${commandPayload.length} commands globally`)
    return
  }

  const guildId = assertRequiredEnv('GUILD_ID')
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commandPayload,
  })
  logScope(
    'commands',
    `Synced ${commandPayload.length} commands to guild ${guildId}`,
  )
}
