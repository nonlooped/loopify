export function assertRequiredEnv(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

export function loadEnv() {
  return {
    port: parseInt(process.env.PORT ?? '4000', 10),
    clientId: assertRequiredEnv('CLIENT_ID'),
    botUsername: process.env.BOT_USERNAME ?? 'Loopify',
    lavalinkHost: assertRequiredEnv('LAVALINK_HOST'),
    lavalinkPort: parseInt(assertRequiredEnv('LAVALINK_PORT'), 10),
    lavalinkPassword: assertRequiredEnv('LAVALINK_SERVER_PASSWORD'),
    internalApiToken: assertRequiredEnv('INTERNAL_API_TOKEN'),
  }
}

export type Env = ReturnType<typeof loadEnv>
