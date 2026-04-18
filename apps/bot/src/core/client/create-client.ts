import { Client, Collection, GatewayIntentBits } from 'discord.js'
import { LavalinkManager } from 'lavalink-client'
import { assertRequiredEnv } from '../../config/env.js'
import type { BotClient, CommandModule } from '../../types/commands.js'

export function createClient() {
  const client: BotClient = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
  }) as BotClient

  client.commands = new Collection<string, CommandModule>()
  client.lavalink = new LavalinkManager({
    nodes: [
      {
        authorization: assertRequiredEnv('LAVALINK_SERVER_PASSWORD'),
        host: assertRequiredEnv('LAVALINK_HOST'),
        port: parseInt(assertRequiredEnv('LAVALINK_PORT'), 10),
        id: 'main',
      },
    ],
    sendToShard: (guildId, payload) =>
      client.guilds.cache.get(guildId)?.shard?.send(payload),
    autoSkip: true,
    client: {
      id: assertRequiredEnv('CLIENT_ID'),
      username: 'Loopify',
    },
  })

  return client
}
