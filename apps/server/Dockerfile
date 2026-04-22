FROM node:25-bookworm-slim

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile --filter server...

COPY apps/server ./apps/server
COPY apps/web ./apps/web

RUN pnpm --filter web build

WORKDIR /app/apps/server
CMD ["pnpm", "start"]
