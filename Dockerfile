# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:20-alpine

# ─── base ─────────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# ─── deps ─────────────────────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# ─── builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm exec prisma generate
RUN pnpm build

# ─── runner ───────────────────────────────────────────────────────────────────
FROM ${NODE_IMAGE} AS runner
RUN apk add --no-cache libc6-compat netcat-openbsd openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Runtime tools (prisma CLI + tsx for seed) live in a side directory so they
# do not collide with the Next.js standalone bundle's own package.json/node_modules.
# chown to nextjs because the prisma CLI writes engine binaries on first use.
RUN mkdir -p /opt/tools && cd /opt/tools && \
    npm init -y >/dev/null && \
    npm install --omit=dev --no-audit --no-fund \
        prisma@5.22.0 tsx@4.19.2 && \
    chown -R nextjs:nodejs /opt/tools
ENV PATH=/opt/tools/node_modules/.bin:$PATH

# Next.js standalone bundle (server.js, minimal package.json, traced node_modules
# including @prisma/client and its generated engine).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Schema, migrations, seed source, and prompts the seed reads from.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/prompts ./prompts

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs
EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
