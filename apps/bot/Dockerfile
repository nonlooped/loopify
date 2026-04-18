# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/bot/package.json ./apps/bot/

RUN pnpm install --frozen-lockfile --filter bot...

COPY apps/bot ./apps/bot

WORKDIR /app/apps/bot

# Uses tsx (matches package.json start) so a strict tsc build is not required for the image.
CMD ["node", "--import", "tsx", "src/index.ts"]
