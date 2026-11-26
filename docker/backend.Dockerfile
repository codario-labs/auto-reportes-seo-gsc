# syntax=docker/dockerfile:1.7
# Backend: API Express + Prisma + Chromium (Playwright) para generar PDFs.

FROM node:24-bookworm-slim AS base
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Manifiestos del monorepo (npm ci necesita todos los package.json de los workspaces).
FROM base AS manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/frontend/package.json apps/frontend/
COPY apps/backend/prisma apps/backend/prisma

# Dependencias completas para compilar.
FROM manifests AS build
RUN npm ci -w @codario/backend -w @codario/shared --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/backend apps/backend
RUN npm run build -w @codario/backend

# Solo dependencias de producción (incluye el CLI de Prisma para "migrate deploy").
FROM manifests AS prod-deps
RUN npm ci -w @codario/backend -w @codario/shared --omit=dev \
 && npm cache clean --force

FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000 \
    STORAGE_DIR=/data/storage \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/package.json ./package.json
# Chromium + dependencias del sistema (fuentes incluidas) para renderizar el PDF.
RUN node node_modules/playwright/cli.js install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /tmp/*
COPY apps/backend/package.json apps/backend/package.json
COPY apps/backend/prisma apps/backend/prisma
COPY --from=build /app/apps/backend/dist apps/backend/dist
RUN mkdir -p /data/storage /app/branding \
 && chown -R node:node /data /app/apps/backend
WORKDIR /app/apps/backend
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
