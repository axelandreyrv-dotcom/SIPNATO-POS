# ── Stage 1: build everything ─────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build

# Native module build tools (better-sqlite3, argon2)
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

RUN corepack enable pnpm

WORKDIR /app

# Copy everything before install so the `prepare` hook (builds shared) has source available.
# This trades install-layer caching for correctness — acceptable for a single-service project.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

RUN pnpm install --frozen-lockfile

# Build order: shared → web → server (prepare already ran shared, but explicit is safer)
RUN pnpm --filter @sipnato/shared build
RUN pnpm --filter @sipnato/web build
RUN pnpm --filter @sipnato/server build

# ── Stage 2: production server ────────────────────────────────────────────────
FROM node:22-bookworm-slim AS server

WORKDIR /app

# Copy workspace manifests (needed so Node can resolve workspace symlinks)
COPY pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Copy pre-built node_modules from build stage — includes compiled native
# binaries for better-sqlite3 and argon2 (node-gyp already ran there).
COPY --from=build /app/node_modules ./node_modules

# Copy compiled TypeScript output
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/server/dist ./apps/server/dist

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "apps/server/dist/index.js"]

# ── Stage 3: Caddy serving compiled web app + proxying API ────────────────────
FROM caddy:2-alpine AS caddy

COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
