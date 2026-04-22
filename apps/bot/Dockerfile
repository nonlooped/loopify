FROM node:25-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/

RUN pnpm install --frozen-lockfile --filter bot...

COPY apps/bot ./apps/bot

WORKDIR /app/apps/bot
CMD ["pnpm", "start"]
