# Loopify

Loopify is a Discord music stack with a simple three-process architecture:

- `apps/web` - Vite React frontend
- `apps/server` - Express API (Discord OAuth + session + Lavalink control plane)
- `apps/bot` - Discord.js bot (slash commands + gateway/voice relay)

Only `apps/server` talks to Lavalink.  
The web app and bot never call each other directly.

## Architecture

```mermaid
flowchart LR
  Web[apps/web]
  Server[apps/server]
  Bot[apps/bot]
  Lavalink[Lavalink]
  Discord[Discord Gateway]

  Web -->|HTTP + SSE| Server
  Bot -->|HTTP + WS (/bot)| Server
  Server --> Lavalink
  Bot --> Discord
```

## Requirements

- Node.js 20+
- pnpm
- Docker / Docker Compose (for Lavalink)

## Environment

Copy `.env.example` to `.env` and fill required values.

Important variables:

- `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`
- `LAVALINK_SERVER_PASSWORD`, `LAVALINK_HOST`, `LAVALINK_PORT`
- `MUSIC_SERVER_URL`
- `BOT_LINK_TOKEN`
- `PUBLIC_BASE_URL`
- `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_OAUTH_REDIRECT_URI`
- `SESSION_SECRET`
- `VITE_DEV_PROXY_TARGET`

## Development

Install dependencies:

```bash
pnpm install
```

Run all services:

```bash
pnpm run dev
```

This starts:

- Lavalink (Docker)
- Express server on port `4000`
- Discord bot
- Vite frontend on port `5173`

Useful single-service commands:

```bash
pnpm run dev:lavalink
pnpm run dev:server
pnpm run dev:bot
pnpm run dev:web
```

## Docker

Start production-like stack:

```bash
pnpm run docker:up
```

Stop:

```bash
pnpm run docker:down
```

Compose runs `lavalink`, `server`, and `bot`.
