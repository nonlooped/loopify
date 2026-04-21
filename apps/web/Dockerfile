FROM node:22-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/
COPY packages/protocol/package.json ./packages/protocol/

RUN pnpm install --frozen-lockfile --filter web...

COPY packages/protocol ./packages/protocol
COPY apps/web ./apps/web

RUN pnpm --filter @loopify/protocol build
RUN pnpm --filter web build

WORKDIR /app/apps/web
CMD ["pnpm", "start"]
