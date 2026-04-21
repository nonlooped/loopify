FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/
COPY packages/protocol/package.json ./packages/protocol/

RUN pnpm install --frozen-lockfile --filter bot...

COPY packages/protocol ./packages/protocol
COPY apps/bot ./apps/bot

RUN pnpm --filter @loopify/protocol build

WORKDIR /app/apps/bot
CMD ["pnpm", "start"]
