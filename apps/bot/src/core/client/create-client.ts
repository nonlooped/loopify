import { Client, Collection, GatewayIntentBits } from 'discord.js'

import type { BotClient, CommandModule } from '../../types/commands.js'

export function createClient(): BotClient {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  }) as BotClient

  client.commands = new Collection<string, CommandModule>()

  return client
}
