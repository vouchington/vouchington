# syntax=docker/dockerfile:1-labs

# Stage 1: Build
FROM node:26-slim AS builder

# Install web dependencies first (separate layer for caching)
WORKDIR /app

# Install Corepack explicitly before enabling it so the build does not depend on
# what the base Node image bundles.
# renovate: datasource=npm depName=corepack
ARG COREPACK_VERSION=0.34.5
RUN npm install -g corepack@${COREPACK_VERSION} --force && corepack enable

# Skip git hooks (husky) in Docker where .git is absent.
ENV HUSKY=0

# Copy dependency metadata before source so source-only changes reuse the
# filtered install/rebuild layer. Root package.json also gives Corepack the
# pinned pnpm version before the first pnpm invocation.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --parents web/package.json backend/types/package.json ts-shared/*/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts --filter 'web...' && \
    pnpm rebuild --pending --filter 'web...'

# Deferred third-party lifecycle scripts only need installed dependencies and
# package manifests, so the install/rebuild layer remains reusable across web
# and shared-workspace source changes.

# Copy workspace packages: resolved via tsconfig paths (../backend/types, ../ts-shared/*).
# Source must exist at the resolved path for Next.js
# webpack to bundle them correctly.
COPY backend/types/ /app/backend/types/
COPY ts-shared/ /app/ts-shared/
# Next build still resolves the Vitest-only JSON catalog import; live SSR uses the backend.
COPY localization/ /app/localization/

COPY web/ /app/web/

ARG NEXT_PUBLIC_GIT_COMMIT
ARG NEXT_PUBLIC_ASSET_PREFIX
ARG STRIP_TEST_IDS
ARG SENTRY_RELEASE
ARG SENTRY_SOURCE_MAP_UPLOAD=0
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_GIT_COMMIT=$NEXT_PUBLIC_GIT_COMMIT
ENV NEXT_PUBLIC_ASSET_PREFIX=$NEXT_PUBLIC_ASSET_PREFIX
ENV STRIP_TEST_IDS=$STRIP_TEST_IDS
ENV SENTRY_RELEASE=$SENTRY_RELEASE
ENV SENTRY_SOURCE_MAP_UPLOAD=$SENTRY_SOURCE_MAP_UPLOAD
# Docker builds are out of scope for the CI FS-cache gate (only the four
# build-web-targets composite-action callers default it off); this keeps the
# web-next-cache mount above load-bearing rather than silently going unused.
ENV WEB_BUILD_FS_CACHE_ENABLED=true

RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    --mount=type=cache,id=web-next-cache,target=/app/web/.next/cache,sharing=locked \
    --mount=type=secret,id=SENTRY_AUTH_TOKEN,required=false \
    set -eu; \
    if [ "$SENTRY_SOURCE_MAP_UPLOAD" = "1" ]; then \
      test -s /run/secrets/SENTRY_AUTH_TOKEN; \
      SENTRY_AUTH_TOKEN="$(cat /run/secrets/SENTRY_AUTH_TOKEN)"; \
      export SENTRY_AUTH_TOKEN; \
    fi; \
    NODE_ENV=production pnpm --dir web exec next build

# Delete build-time source maps from the standalone runtime output. Saves ~0.65 MiB.
RUN find /app/web/.next/standalone /app/web/.next/static -type f -name '*.map' -delete 2>/dev/null || true

# Base Alpine image with security patches applied once, shared by prewarm and runner.
# apk upgrade here rather than only in runner means web-prewarm also runs on a
# patched image, and the upgrade IO runs once instead of once per runtime stage.
FROM node:26-alpine AS base-alpine
# Bump this after a security advisory so the cached package layer is rebuilt.
ARG ALPINE_SECURITY_REFRESH=2026-08-26
RUN echo "Refreshing Alpine security packages: ${ALPINE_SECURITY_REFRESH}" && \
    apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

# Stage 2a: Prewarm V8 compile cache
# Runs on the same base as runner so the cache keys (Node binary + file paths) match exactly.
FROM base-alpine AS web-prewarm

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --link --from=builder /app/web/public ./web/public
COPY --link --from=builder --chown=1001:1001 /app/web/.next/standalone ./
COPY --link --from=builder --chown=1001:1001 /app/web/.next/static ./web/.next/static

WORKDIR /app/web

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NODE_COMPILE_CACHE=/app/web/.node_compile_cache

# renovate: datasource=npm depName=node-prewarm
ARG NODE_PREWARM_VERSION=0.3.0
# Run as root so the npm cache mount (/root/.npm) is writable; compile cache is
# assigned to the nextjs user/group IDs when copied into the runner stage.
RUN --mount=type=cache,id=npm-prewarm-web,target=/root/.npm \
    npx --yes node-prewarm@${NODE_PREWARM_VERSION} "node server.js" --port 3000

USER 1001

# Stage 2b: Production runtime
FROM base-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Remove package-manager CLIs, native-build headers, and local docs not needed at runtime.
# apk upgrade and its cache cleanup ran in base-alpine.
RUN if command -v corepack >/dev/null 2>&1; then corepack disable; fi && \
    rm -rf /usr/local/lib/node_modules/corepack /usr/local/bin/corepack \
           /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/pnpm /usr/local/bin/pnpx \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
           /usr/local/include/node /usr/local/share/doc /usr/local/share/man \
           /usr/share/doc /usr/share/man /usr/share/info

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --link --from=builder /app/web/public ./web/public
# Preserve the monorepo standalone layout: traced dependencies live at the
# standalone root and the web server lives under standalone/web.
COPY --link --from=builder --chown=1001:1001 /app/web/.next/standalone ./
COPY --link --from=builder --chown=1001:1001 /app/web/.next/static ./web/.next/static
COPY --link --from=web-prewarm --chown=1001:1001 /app/web/.node_compile_cache ./web/.node_compile_cache

WORKDIR /app/web

USER 1001

EXPOSE 3000

ENV PORT=3000
# ENV HOSTNAME is a build-time default. Fargate awsvpc injects HOSTNAME=<ENI DNS name>
# at runtime, overriding this ENV. The CMD below re-asserts HOSTNAME=:: via env(1) so the
# server binds all interfaces. IPv6-only ECS tasks (#7987) have no IPv4 address on the task
# ENI, so a '0.0.0.0' (IPv4-wildcard) bind would leave the ALB's IPv6 target group unable to
# reach this server at all while the loopback container health check stayed green — '::'
# with the default net.ipv6.bindv6only=0 accepts both IPv6 and IPv4-mapped connections, so
# the loopback health check below and dual-stack ALB targets keep working too.
# See vouchington-infra/opentofu/ecs-web.tf for the health check definition.
ENV HOSTNAME=::
ENV NODE_COMPILE_CACHE=/app/web/.node_compile_cache

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD ["node", "-e", "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

CMD ["env", "HOSTNAME=::", "node", "server.js"]
