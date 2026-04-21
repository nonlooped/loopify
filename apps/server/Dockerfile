FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY packages/protocol/package.json ./packages/protocol/

RUN pnpm install --frozen-lockfile --filter server...

COPY packages/protocol ./packages/protocol
COPY apps/server ./apps/server

RUN pnpm --filter @loopify/protocol build

WORKDIR /app/apps/server
CMD ["pnpm", "start"]
