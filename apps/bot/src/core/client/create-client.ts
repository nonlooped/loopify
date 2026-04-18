import { Client, Collection, GatewayIntentBits } from 'discord.js'
import type { BotClient, CommandModule } from '../../types/commands.js'

export function createClient() {
  const client: BotClient = new Client({
    intents: [GatewayIntentBits.Guilds],
  }) as BotClient

  client.commands = new Collection<string, CommandModule>()
  return client
}
