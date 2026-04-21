export function assertEnv(key: string): string {
  const v = process.env[key]
  if (!v) {
    throw new Error(`Missing ${key}`)
  }
  return v
}

export function loadWebEnv() {
  return {
    port: parseInt(process.env.PORT ?? '8080', 10),
    publicBaseUrl: assertEnv('PUBLIC_BASE_URL').replace(/\/$/, ''),
    musicServerUrl: assertEnv('MUSIC_SERVER_URL').replace(/\/$/, ''),
    internalToken: assertEnv('INTERNAL_API_TOKEN'),
    discordClientId: assertEnv('DISCORD_CLIENT_ID'),
    discordClientSecret: assertEnv('DISCORD_CLIENT_SECRET'),
    discordRedirectUri: assertEnv('DISCORD_OAUTH_REDIRECT_URI'),
    sessionSecret: new TextEncoder().encode(assertEnv('WEB_SESSION_SECRET')),
  }
}

export type WebEnv = ReturnType<typeof loadWebEnv>
