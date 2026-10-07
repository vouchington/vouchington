# syntax=docker/dockerfile:1-labs

# Stage 1: Build
FROM node:26-slim AS builder

# Install web dependencies first (separate layer for caching)
WORKDIR /app

# Install pnpm with npm so the build does not depend on what the base Node image
# bundles. pnpm-activation.test.mts keeps this major equal to CI's pnpm/action-setup
# `latest-<major>`.
ARG PNPM_VERSION=12
RUN npm install -g pnpm@${PNPM_VERSION}

# Skip git hooks (husky) in Docker where .git is absent.
ENV HUSKY=0

# Copy dependency metadata before source so source-only changes reuse the
# filtered install/rebuild layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --parents web/package.json backend/types/package.json ts-shared/*/package.json ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --ignore-scripts --filter 'web...' && \
    pnpm rebuild --pending --filter 'web...'

# Deferred third-party lifecycle scripts only need installed dependencies and
# package manifests, so the install/rebuild layer remains reusable across web
# and shared-workspace source changes.

# Copy workspace packages: resolved via tsconfig paths (../backend/types, ../ts-shared/*).
# The shared membership catalog and validator are build-generation inputs;
# next.config regenerates the web JSON snapshot before bundling.
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

# Base Alpine image with security patches applied once.
# web-prewarm needs npm/npx from this image. The pulled runtime image does not
# inherit these layers; runtime-base snapshots the cleaned filesystem below.
# apk upgrade here rather than in every consumer means the upgrade runs once.
FROM node:26-alpine AS base-alpine
# Bump this after a security advisory so the cached package layer is rebuilt.
ARG ALPINE_SECURITY_REFRESH=2026-08-26
RUN echo "Refreshing Alpine security packages: ${ALPINE_SECURITY_REFRESH}" && \
    apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

# A rm in a child of node:26-alpine only whiteouts files. The upstream layer
# would still be pulled. Assemble the cleaned root at /out and copy that tree
# onto scratch so package-manager CLIs, native-build headers, and local docs
# are absent from the runtime image. Copying `/` is rejected by Hadolint
# DL3067; `/out` keeps the same merged filesystem without proc, sys, or dev.
# scratch drops image config, so restore the node:26-alpine PATH and entrypoint
# that `env` / `docker-entrypoint.sh` resolution depends on.
FROM base-alpine AS runtime-root
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
           /usr/local/bin/pnpm /usr/local/bin/pnpx \
           /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg \
           /usr/local/include/node /usr/local/share/doc /usr/local/share/man \
           /usr/share/doc /usr/share/man /usr/share/info && \
    mkdir /out && \
    cp -a /bin /etc /home /lib /media /mnt /opt /root /run /sbin /srv /tmp /usr /var /out/

FROM scratch AS runtime-base
COPY --from=runtime-root /out /
ENV PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
ENTRYPOINT ["docker-entrypoint.sh"]

# Stage 2a: Prewarm V8 compile cache
# Stays on base-alpine because node-prewarm is installed with npx. runtime-base
# copies that same Node binary, and the server path stays /app/web, so the
# compile cache still matches the runner.
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
FROM runtime-base AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

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
