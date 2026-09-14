# syntax=mirror.gcr.io/docker/dockerfile:1-labs

# Base Node.js image with Debian security patches applied once.
# node:26-trixie-slim (Debian trixie, glibc 2.40) is required over bookworm-slim (glibc 2.36)
# because @glidemq/speedkey's prebuilt native binary references __isoc23_sscanf (added in glibc 2.38).
# Running apt-get upgrade here rather than in each downstream stage deduplicates
# the network IO and shrinks the BuildKit cache export.
FROM mirror.gcr.io/library/node:26-trixie-slim AS base-node
RUN apt-get update && apt-get upgrade -y --no-install-recommends && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* /var/lib/dpkg/info/*.md5sums \
           /usr/share/man /usr/share/doc /usr/share/locale /usr/share/info

# Distroless can lag Debian security uploads even after the fixed packages are available.
# Materialize the upgraded OpenSSL runtime files and package metadata from base-node so Trivy
# evaluates the code that the final image actually loads instead of a stale distroless package.
FROM base-node AS openssl-overlay
RUN set -- /usr/lib/*-linux-gnu/libssl.so.3 && \
    [ "$#" -eq 1 ] && \
    multiarch_dir="${1%/libssl.so.3}" && \
    overlay=/distroless-openssl && \
    mkdir -p "$overlay/var/lib/dpkg/status.d" && \
    cp -a --parents \
      "$multiarch_dir/libcrypto.so.3" \
      "$multiarch_dir/libssl.so.3" \
      "$multiarch_dir/engines-3" \
      "$multiarch_dir/ossl-modules/legacy.so" \
      "$overlay" && \
    dpkg-query -s libssl3t64 > "$overlay/var/lib/dpkg/status.d/libssl3t64" && \
    dpkg-query -s openssl-provider-legacy > "$overlay/var/lib/dpkg/status.d/openssl-provider-legacy"

# Distroless Node 26 runtime base: ~40 MiB vs ~150 MiB for node:26-trixie-slim.
# No shell, no apt, no package managers — nonroot user (65532) is built in.
# nodejs26-debian13 uses Debian trixie (glibc 2.40), matching base-node, so
# @glidemq/speedkey's prebuilt native binary (__isoc23_sscanf, added in glibc 2.38) works.
# ENTRYPOINT is /nodejs/bin/node; /nodejs/bin is NOT on PATH, so callers that
# bypass ENTRYPOINT (ECS healthcheck CMD, docker exec) must use the absolute path.
# renovate: datasource=docker depName=gcr.io/distroless/nodejs26-debian13
FROM gcr.io/distroless/nodejs26-debian13:nonroot AS runtime-base
COPY --from=openssl-overlay /distroless-openssl/ /

# Stage 1: Build Node.js application with dependencies
FROM base-node AS builder

WORKDIR /app

# Install Corepack explicitly before enabling it so the build does not depend on
# what the base Node image bundles.
# renovate: datasource=npm depName=corepack
ARG COREPACK_VERSION=0.34.5
RUN npm install -g corepack@${COREPACK_VERSION} --force && corepack enable

# Copy the root dependency contract first so Corepack can resolve the pinned
# pnpm version from packageManager. Workspace manifests follow before the one
# filtered install layer; application source changes therefore keep dependency
# installation cached without a separate lifecycle-running prefetch pass.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies needed for the production runtime plus builder-only tools.
# ts-shared sub-packages are declared as workspaces in backend/package.json, so
# pnpm installs them from the shared workspace lockfile.
# ts-shared has no root package.json; its sub-packages are installed as backend workspaces.
COPY --parents api-fixtures/package.json backend/package.json backend/*/package.json backend/*/*/package.json ci/package.json email-templates/package.json ts-shared/*/package.json ./

# Skip workspace postinstall scripts during dependency install.
# email templates are built explicitly later.
# Skip git hooks (husky) in Docker where .git is absent.
# The prepare script also checks for the script file before running it.
ENV HUSKY=0

# Install dependencies with workspace scripts disabled, then run the deferred
# install scripts. This compiles third-party native packages such as sharp
# (backend) and esbuild (email-templates), which only need node_modules +
# package.json — not app source — so this runs here, before the source COPYs
# below, and caches on the lockfile instead of invalidating on every backend
# source edit.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile --filter @entrypoints/api... --filter @entrypoints/worker-cpu... --filter @entrypoints/worker-io... --filter ./email-templates... --ignore-scripts && \
    pnpm rebuild --pending --filter @entrypoints/api... --filter @entrypoints/worker-cpu... --filter @entrypoints/worker-io... --filter ./email-templates...

# Copy only the source trees needed by the backend runtime build. The shared
# root .dockerignore also admits the web workspace for web/Dockerfile, but
# backend builds should not invalidate this layer on unrelated web source edits.
COPY api-fixtures/ ./api-fixtures/
COPY email-templates/ ./email-templates/
COPY static-code-analysis/docker-deploy/ ./static-code-analysis/docker-deploy/
COPY ts-shared/ ./ts-shared/
COPY backend/ ./backend/
COPY localization/ ./localization/

# Build runtime artifacts that need source files and builder-only dependencies.
# Run via node directly to avoid pnpm triggering a root-level install after
# COPY . . exposes uninstalled workspaces (web, cloudflare-worker, lambdas, etc.).
# Keep the build script plain ESM so it runs under every Node version used by
# setup and image build steps.
RUN node email-templates/build.mjs && \
    mkdir -p /app/localization && \
    node --experimental-strip-types backend/services/localization/compile-cli.mts --source localization/catalog --output /app/localization/catalog.sqlite

# Stage 2a: Deploy API production tree.
# These three deploy-* stages are siblings off builder, so BuildKit executes
# them in parallel — three independent hard-link/copy operations instead of
# one serial chain. sharing=shared allows concurrent reads from the pnpm store.
# Deploy runs approved dependency lifecycle scripts so native packages remain
# complete; the root prepare hook skips Husky when production dependencies omit it.
FROM builder AS deploy-api
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=shared \
    pnpm deploy --filter @entrypoints/api --prod /prod/api --legacy && \
    node --experimental-strip-types static-code-analysis/docker-deploy/prune-deployed-runtime-deps.mts /prod/api
# Strip redundant @opentelemetry/semantic-conventions build formats. The package
# ships src, esm, and esnext; Node resolves one via package.json exports. Drop
# the two unused alternates to save ~8 MiB per image.
RUN find /prod/api/node_modules/.pnpm -type d -name 'esm' \
        -path '*/@opentelemetry/semantic-conventions/build/esm' \
        -prune -exec rm -rf {} + 2>/dev/null || true && \
    find /prod/api/node_modules/.pnpm -type d -name 'esnext' \
        -path '*/@opentelemetry/semantic-conventions/build/esnext' \
        -prune -exec rm -rf {} + 2>/dev/null || true
# Node's native TypeScript loader refuses to strip types for files whose
# resolved path is under node_modules. pnpm deploy copies workspace packages
# into node_modules/.pnpm, so relocate each copy outside node_modules (leaving
# symlinks behind) while preserving pnpm's resolution topology for third-party
# packages.
# Relocate workspace packages, then pin prunedAt and clamp mtimes so the
# node_modules layer digest is identical across rebuilds of an unchanged
# dependency graph (#9359). Same RUN to satisfy Hadolint DL3059.
RUN node --experimental-strip-types static-code-analysis/docker-deploy/restore-deployed-workspace-packages.mts /prod/api && \
    node --experimental-strip-types static-code-analysis/docker-deploy/normalize-deployed-layer.mts /prod/api

# Stage 2b: Deploy worker-cpu production tree (parallel with 2a and 2c).
FROM builder AS deploy-worker-cpu
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=shared \
    pnpm deploy --filter @entrypoints/worker-cpu --prod /prod/worker-cpu --legacy && \
    node --experimental-strip-types static-code-analysis/docker-deploy/prune-deployed-runtime-deps.mts /prod/worker-cpu
RUN find /prod/worker-cpu/node_modules/.pnpm -type d -name 'esm' \
        -path '*/@opentelemetry/semantic-conventions/build/esm' \
        -prune -exec rm -rf {} + 2>/dev/null || true && \
    find /prod/worker-cpu/node_modules/.pnpm -type d -name 'esnext' \
        -path '*/@opentelemetry/semantic-conventions/build/esnext' \
        -prune -exec rm -rf {} + 2>/dev/null || true
RUN node --experimental-strip-types static-code-analysis/docker-deploy/restore-deployed-workspace-packages.mts /prod/worker-cpu && \
    node --experimental-strip-types static-code-analysis/docker-deploy/normalize-deployed-layer.mts /prod/worker-cpu

# Stage 2c: Deploy worker-io production tree (parallel with 2a and 2b).
FROM builder AS deploy-worker-io
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store,sharing=shared \
    pnpm deploy --filter @entrypoints/worker-io --prod /prod/worker-io --legacy && \
    node --experimental-strip-types static-code-analysis/docker-deploy/prune-deployed-runtime-deps.mts /prod/worker-io
RUN find /prod/worker-io/node_modules/.pnpm -type d -name 'esm' \
        -path '*/@opentelemetry/semantic-conventions/build/esm' \
        -prune -exec rm -rf {} + 2>/dev/null || true && \
    find /prod/worker-io/node_modules/.pnpm -type d -name 'esnext' \
        -path '*/@opentelemetry/semantic-conventions/build/esnext' \
        -prune -exec rm -rf {} + 2>/dev/null || true
RUN node --experimental-strip-types static-code-analysis/docker-deploy/restore-deployed-workspace-packages.mts /prod/worker-io && \
    node --experimental-strip-types static-code-analysis/docker-deploy/normalize-deployed-layer.mts /prod/worker-io

# Stage 3-prewarm-base: Share the distroless Node setup across every prewarm target.
# Children inherit this base-node ancestry (they need npx/shell) but spawn serve.mts
# via the distroless binary so compile-cache keys match runtime.
FROM base-node AS prewarm-base

ENV NODE_ENV=production

WORKDIR /app/backend

# Bring in the distroless Node 26 binary once so every prewarmed cache is keyed against it.
COPY --from=runtime-base /nodejs /nodejs

# Stage 3a-prewarm: Prewarm V8 compile cache for API server.
FROM prewarm-base AS api-prewarm

COPY --link --from=deploy-api /prod/api ./

ENV NODE_COMPILE_CACHE=/app/backend/.node_compile_cache

# NODE_PREWARM=1 skips runtime-only database and environment validation (no runtime config at build time).
# CLOUDFLARE_TURNSTILE_SECRET_KEY must be a non-test value to pass the production guard.
# Run as root so the npm cache mount (/root/.npm) is writable; compile cache is
# chown'd to 65532:65532 (nonroot) when copied into the api stage.
# The monitored child ("/nodejs/bin/node serve.mts") uses the distroless binary.
# renovate: datasource=npm depName=node-prewarm
ARG NODE_PREWARM_VERSION=0.3.0
RUN --mount=type=cache,id=npm-prewarm-api,target=/root/.npm \
    NODE_PREWARM=1 CLOUDFLARE_TURNSTILE_SECRET_KEY=prewarm \
    npx --yes node-prewarm@${NODE_PREWARM_VERSION} "/nodejs/bin/node serve.mts" --port 3000

# Stage 3b-prewarm: Prewarm V8 compile cache for CPU-bound worker.
# NODE_PREWARM=1 skips startWorkerRuntime() (no Valkey subscriptions at build time).
# NODE_PREWARM_PORT provides the TCP port node-prewarm monitors for readiness.
FROM prewarm-base AS worker-cpu-prewarm

ENV NODE_OPTIONS="--max-old-space-size=768"
ENV UV_THREADPOOL_SIZE=4
ENV RUST_TOKIO_WORKER_THREADS=2
ENV RUST_TOKIO_MAX_BLOCKING_THREADS=2
ENV RAYON_NUM_THREADS=2

COPY --link --from=deploy-worker-cpu /prod/worker-cpu ./

ENV NODE_COMPILE_CACHE=/app/backend/.node_compile_cache

# Run as root so the npm cache mount (/root/.npm) is writable; compile cache is
# chown'd to 65532:65532 (nonroot) when copied into the worker-cpu stage.
# The monitored child ("/nodejs/bin/node serve.mts") uses the distroless binary.
# renovate: datasource=npm depName=node-prewarm
ARG NODE_PREWARM_VERSION=0.3.0
RUN --mount=type=cache,id=npm-prewarm-worker-cpu,target=/root/.npm \
    NODE_PREWARM=1 NODE_PREWARM_PORT=3001 \
    npx --yes node-prewarm@${NODE_PREWARM_VERSION} "/nodejs/bin/node serve.mts" --port 3001

# Stage 3c-prewarm: Prewarm V8 compile cache for IO-bound worker.
FROM prewarm-base AS worker-io-prewarm

ENV NODE_OPTIONS="--max-old-space-size=384"
ENV UV_THREADPOOL_SIZE=4
ENV RUST_TOKIO_WORKER_THREADS=2
ENV RUST_TOKIO_MAX_BLOCKING_THREADS=2
ENV RAYON_NUM_THREADS=2

COPY --link --from=deploy-worker-io /prod/worker-io ./

ENV NODE_COMPILE_CACHE=/app/backend/.node_compile_cache

# Run as root so the npm cache mount (/root/.npm) is writable; compile cache is
# chown'd to 65532:65532 (nonroot) when copied into the worker-io stage.
# The monitored child ("/nodejs/bin/node serve.mts") uses the distroless binary.
# renovate: datasource=npm depName=node-prewarm
ARG NODE_PREWARM_VERSION=0.3.0
RUN --mount=type=cache,id=npm-prewarm-worker-io,target=/root/.npm \
    NODE_PREWARM=1 NODE_PREWARM_PORT=3002 \
    npx --yes node-prewarm@${NODE_PREWARM_VERSION} "/nodejs/bin/node serve.mts" --port 3002

# Stage 3d: Production runtime — API server.
# Distroless: no shell, no apt, no package managers. ENTRYPOINT is /nodejs/bin/node.
# Nonroot user 65532 is built into the image; no groupadd/useradd needed.
FROM runtime-base AS api

ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
ENV NODE_ENV=production

WORKDIR /app/backend

# Copy deps and app as separate --link layers so an app-only commit does not
# re-upload the third-party node_modules blob (#9359). The exclude matches only
# the source-root node_modules directory (Go filepath.Match), so
# workspace-packages/**/node_modules backlinks from restore stay in the app layer.
COPY --link --from=deploy-api --chown=65532:65532 /prod/api/node_modules ./node_modules
COPY --link --from=deploy-api --exclude=node_modules --chown=65532:65532 /prod/api ./
COPY --link --from=api-prewarm --chown=65532:65532 /app/backend/.node_compile_cache /app/backend/.node_compile_cache
COPY --link --from=builder --chown=65532:65532 /app/localization/catalog.sqlite /app/localization/catalog.sqlite

ENV NODE_COMPILE_CACHE=/app/backend/.node_compile_cache
ENV LOCALIZATION_SQLITE_PATH=/app/localization/catalog.sqlite

# Expose default port
EXPOSE 3000

# No HEALTHCHECK here — add one in your orchestration layer:
#   ECS task definition: healthCheck.command (use /nodejs/bin/node — /nodejs/bin is not on PATH)
#   Kubernetes:          livenessProbe / readinessProbe
#   Docker Compose:      healthcheck: section
#   docker run:          --health-cmd

CMD ["serve.mts"]

# Stage 3e: Production runtime — CPU worker (Rust NAPI, sharp).
# Lightpanda browser crawling connects to Lightpanda's cloud CDP endpoint over
# Playwright (LIGHTPANDA_CDP_URL/LIGHTPANDA_TOKEN) — no local browser binary.
# Sized for a 512 CPU / 1024 MiB Fargate task (~75% → 768 MiB Node heap, 4 libuv threads).
# Distroless: no shell, no apt, no package managers. ENTRYPOINT is /nodejs/bin/node.
FROM runtime-base AS worker-cpu

ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=768"
ENV UV_THREADPOOL_SIZE=4
ENV RUST_TOKIO_WORKER_THREADS=2
ENV RUST_TOKIO_MAX_BLOCKING_THREADS=2
ENV RAYON_NUM_THREADS=2

WORKDIR /app/backend

# Copy deps and app as separate --link layers so an app-only commit does not
# re-upload the third-party node_modules blob (#9359). The exclude matches only
# the source-root node_modules directory (Go filepath.Match), so
# workspace-packages/**/node_modules backlinks from restore stay in the app layer.
COPY --link --from=deploy-worker-cpu --chown=65532:65532 /prod/worker-cpu/node_modules ./node_modules
COPY --link --from=deploy-worker-cpu --exclude=node_modules --chown=65532:65532 /prod/worker-cpu ./
COPY --link --from=worker-cpu-prewarm --chown=65532:65532 /app/backend/.node_compile_cache /app/backend/.node_compile_cache
COPY --link --from=builder --chown=65532:65532 /app/localization/catalog.sqlite /app/localization/catalog.sqlite

ENV NODE_COMPILE_CACHE=/app/backend/.node_compile_cache
ENV LOCALIZATION_SQLITE_PATH=/app/localization/catalog.sqlite

CMD ["serve.mts"]

# Stage 3f: Production runtime — IO worker (IO-only).
# Sized for a 256 CPU / 512 MiB Fargate task (~75% → 384 MiB Node heap, 4 libuv threads).
# Distroless: no shell, no apt, no package managers. ENTRYPOINT is /nodejs/bin/node.
FROM runtime-base AS worker-io

ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=384"
ENV UV_THREADPOOL_SIZE=4
ENV RUST_TOKIO_WORKER_THREADS=2
ENV RUST_TOKIO_MAX_BLOCKING_THREADS=2
ENV RAYON_NUM_THREADS=2

WORKDIR /app/backend

# Copy deps and app as separate --link layers so an app-only commit does not
# re-upload the third-party node_modules blob (#9359). The exclude matches only
# the source-root node_modules directory (Go filepath.Match), so
# workspace-packages/**/node_modules backlinks from restore stay in the app layer.
COPY --link --from=deploy-worker-io --chown=65532:65532 /prod/worker-io/node_modules ./node_modules
COPY --link --from=deploy-worker-io --exclude=node_modules --chown=65532:65532 /prod/worker-io ./
COPY --link --from=worker-io-prewarm --chown=65532:65532 /app/backend/.node_compile_cache /app/backend/.node_compile_cache
COPY --link --from=builder --chown=65532:65532 /app/localization/catalog.sqlite /app/localization/catalog.sqlite

ENV NODE_COMPILE_CACHE=/app/backend/.node_compile_cache
ENV LOCALIZATION_SQLITE_PATH=/app/localization/catalog.sqlite

CMD ["serve.mts"]
