<div align="center">

# Loopify

### A Discord music bot with a web-based controller—run queues and playback from the guild and from the browser.

[![License: MIT](https://img.shields.io/badge/license-MIT-326ce5?style=flat-square)](./LICENSE)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-f69220?style=flat-square&logo=pnpm&logoColor=fff)](https://pnpm.io/)
[![Node.js](https://img.shields.io/badge/node-%E2%89%A520-339933?style=flat-square&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

<br />

[Repository](https://github.com/unloopedmido/loopify) · [Issues](https://github.com/unloopedmido/loopify/issues)

</div>

---

## The problem

Music bots sit at the intersection of Discord’s gateway, audio pipelines, and whatever UX you expose in chat. As features grow, you often want a **separate control surface** - a web UI for queues, volume, and session management - without cramming everything into slash options alone.

**Loopify** is structured for that split: a **bot process** on [discord.js](https://discord.js.org/) (scaffolded with [ForgeLoop](https://www.npmjs.com/package/create-forgeloop)) and a **web app** (React + Vite) meant to act as the controller. Same product, two processes, room to scale each side independently.

---

## Repository layout

| Path | Role |
| ---- | ---- |
| `apps/bot` | Discord bot: commands, events, interactions, gateway session |
| `apps/web` | Web controller: React + Vite (dev server with HMR) |
| `infra/` | Lavalink `application.yml` and related infra config (used by Docker Compose) |
| `docker-compose.yml` | Lavalink, bot, and web stack with health-based startup order |

Root tooling: [Biome](https://biomejs.dev/) for lint/format across the workspace.

<details>
<summary><b>Details</b> — ForgeLoop on the bot</summary>

The bot includes `forgeloop.config.mjs` and is intended to be extended with ForgeLoop CLI workflows (for example adding commands).

Commands sync on startup:

- **Development** uses **guild** sync and requires `GUILD_ID`.
- **Production** uses **global** sync when `NODE_ENV=production`.

Manual deploy from `apps/bot`:

```bash
pnpm forgeloop commands deploy --guild
# or
pnpm forgeloop commands deploy --global
```

</details>

---

## Getting started

**Requirements:** Node.js 20+ and [pnpm](https://pnpm.io/installation).

```bash
git clone https://github.com/unloopedmido/loopify.git
cd loopify
pnpm install
```

### Environment (bot)

Create `apps/bot/.env` (do not commit real tokens):

| Variable | Purpose |
| -------- | ------- |
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application (client) ID |
| `GUILD_ID` | Target guild for **development** command sync |

For global command sync in production, set `NODE_ENV=production` and omit guild-scoped requirements per your deploy model.

### Run locally

Two terminals from the repo root:

```bash
pnpm --filter bot dev
```

```bash
pnpm --filter web dev
```

The Vite dev server prints a local URL (default port **5173**). The bot logs to the terminal running `bot dev`.

### Run with Docker

**Requirements:** [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/) (Compose v2 is included with Docker Desktop).

1. Copy [`.env.example`](./.env.example) to `.env` at the **repository root** (next to `docker-compose.yml`) and fill in secrets. Compose substitutes these values into `docker-compose.yml`; required variables use `:?` and will fail fast if missing.

2. Start the stack:

```bash
docker compose up --build
```

**Services and startup order:** A one-shot **BusyBox** service fixes permissions on the Lavalink plugins volume (named volumes are root-owned by default; Lavalink runs as UID 322). Then **Lavalink** becomes healthy, then the **bot** (after Discord login, it marks readiness via `/tmp/bot-ready`), then the **web** app (nginx serving the Vite production build). In Docker Desktop you may see the init container stopped after exit; that is expected.

| Variable (root `.env`) | Purpose |
| ---------------------- | ------- |
| `LAVALINK_SERVER_PASSWORD` | Lavalink REST/WebSocket password (must match `infra/application.yml` substitution) |
| `SERVER_ADDRESS` | Bind address inside the Lavalink container (default `0.0.0.0`) |
| `LAVA_PUBLISH_PORT` | Host port mapped to Lavalink `2333` |
| `DISCORD_TOKEN` | Bot token |
| `CLIENT_ID` | Application (client) ID |
| `GUILD_ID` | Optional in the Compose bot service: `NODE_ENV` is `production`, so commands sync **globally** unless you change that |
| `WEB_PUBLISH_PORT` | Host port mapped to the web UI (`80` in the container) |

Inside the Compose network the bot can reach Lavalink at host **`lavalink`** on port **2333**. The web UI defaults to **http://localhost:8080** (or your `WEB_PUBLISH_PORT`).

---

## Root scripts

| Script | Purpose |
| ------ | ------- |
| `pnpm run check` | Biome check (format + lint) |
| `pnpm run format` | Biome format with write |
| `pnpm run lint` | Biome lint |

---

## FAQ

**Why pnpm workspaces?** One lockfile and shared tooling while `apps/bot` and `apps/web` stay independently runnable.

**Where does music logic live?** In the bot service (and any APIs you add); the web app is the controller surface. Wire them together as you implement playback and session APIs.

**Is the web app required?** No. The bot runs standalone; the web UI is optional for operator-style control.

**Local dev vs Docker env files:** Local runs use `apps/bot/.env` (and whatever you configure for Vite). The Compose stack reads a **root** `.env` for substitution and passes variables into containers—keep those separate so you do not confuse guild dev settings with production-like Compose settings.

---

## Contributing

Issues and PRs are welcome on [GitHub](https://github.com/unloopedmido/loopify). Run `pnpm run check` before submitting substantive changes.

## License

MIT — see [`LICENSE`](./LICENSE).
