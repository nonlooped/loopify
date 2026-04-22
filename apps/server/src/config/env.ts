export function assertRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

export function loadEnv() {
  return {
    port: parseInt(process.env.SERVER_PORT ?? process.env.PORT ?? '4000', 10),
    clientId: assertRequiredEnv('CLIENT_ID'),
    botUsername: process.env.BOT_USERNAME ?? 'Loopify',
    lavalinkHost: assertRequiredEnv('LAVALINK_HOST'),
    lavalinkPort: parseInt(assertRequiredEnv('LAVALINK_PORT'), 10),
    lavalinkPassword: assertRequiredEnv('LAVALINK_SERVER_PASSWORD'),
    botLinkToken: assertRequiredEnv('BOT_LINK_TOKEN'),
    publicBaseUrl: assertRequiredEnv('PUBLIC_BASE_URL').replace(/\/$/, ''),
    discordClientId: assertRequiredEnv('DISCORD_CLIENT_ID'),
    discordClientSecret: assertRequiredEnv('DISCORD_CLIENT_SECRET'),
    discordRedirectUri: assertRequiredEnv('DISCORD_OAUTH_REDIRECT_URI'),
    sessionSecret: assertRequiredEnv('SESSION_SECRET'),
  }
}

export type Env = ReturnType<typeof loadEnv>
