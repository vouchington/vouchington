# syntax=ghcr.io/vouchington/dependency-dockerfile:1-labs@sha256:ad43eec41369d9ef94412c0d1eb3203d12218d01da225afc92a3aeba3a0e7796

# Base Node.js image with Debian security patches applied once.
# node:26-trixie-slim (Debian trixie, glibc 2.40) is required over bookworm-slim (glibc 2.36)
# because @glidemq/speedkey's prebuilt native binary references __isoc23_sscanf (added in glibc 2.38).
# Running apt-get upgrade here rather than in each downstream stage deduplicates
# the network IO and shrinks the BuildKit cache export.
FROM ghcr.io/vouchington/dependency-node:26-trixie-slim@sha256:36793bcbb160a6a16cede1e62b93f84e26b78a972a8a4c0b879c1c12f22761ec AS base-node
RUN apt-get update && apt-get upgrade -y --no-install-recommends && \
    rm -rf /var/lib/apt/lists/* /var/cache/apt/archives/* /var/lib/dpkg/info/*.md5sums \
           /usr/share/man /usr/share/doc /usr/share/locale /usr/share/info

# Distroless can lag Debian security uploads even after the fixed packages are available.
# Materialize the upgraded OpenSSL and zlib runtime files and package metadata from base-node
# so Trivy evaluates the code that the final image actually loads instead of a stale distroless package.
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
    libz="$(readlink -f "$multiarch_dir/libz.so.1")" && \
    cp -a --parents "$libz" "$overlay" && \
    if [ "$libz" != "$multiarch_dir/libz.so.1" ]; then \
      cp -a "$multiarch_dir/libz.so.1" "$overlay$multiarch_dir/libz.so.1"; \
    fi && \
    dpkg-query -s libssl3t64 > "$overlay/var/lib/dpkg/status.d/libssl3t64" && \
    dpkg-query -s openssl-provider-legacy > "$overlay/var/lib/dpkg/status.d/openssl-provider-legacy" && \
    dpkg-query -s zlib1g > "$overlay/var/lib/dpkg/status.d/zlib1g"

FROM base-node AS zlib-overlay
RUN set -- /usr/lib/*-linux-gnu/libz.so.1 && \
    [ "$#" -eq 1 ] && \
    libz="$1" && \
    resolved="$(readlink -f "$libz")" && \
    overlay=/distroless-zlib && \
    mkdir -p "$overlay/var/lib/dpkg/status.d" && \
    cp -a --parents "$resolved" "$overlay" && \
    if [ "$resolved" != "$libz" ]; then cp -a --parents "$libz" "$overlay"; fi && \
    dpkg-query -s zlib1g > "$overlay/var/lib/dpkg/status.d/zlib1g"

# Distroless runtime base: glibc and libstdc++ for the compiled Bun executables and their native
# addons, with no shell, apt, or package managers; nonroot user (65532) is built in.
# nodejs26-debian13 uses Debian trixie (glibc 2.40), matching base-node, so
# @glidemq/speedkey's prebuilt native binary (__isoc23_sscanf, added in glibc 2.38) works.
# The executables don't use its Node. The ECS health check runs /nodejs/bin/node -e fetch(...)
# until infrastructure switches to the supported healthcheck.mts executable command.
FROM ghcr.io/vouchington/dependency-distroless-nodejs:nonroot@sha256:96455baef11b178fc135b32206e3922c515dbed2400676c94f907f8f84e6abf6 AS runtime-base
COPY --from=openssl-overlay /distroless-openssl/ /
COPY --from=zlib-overlay /distroless-zlib/ /

# Stage 1: Install the workspace and compile the backend executables. Each runtime image ships one
# executable and the files it reads from disk, not a node_modules tree.
FROM base-node AS builder

WORKDIR /app

# Install pnpm with npm so the build does not depend on what the base Node image
# bundles. CI follows the same pnpm major.
ARG PNPM_VERSION=12
# The backend ships as Bun standalone executables; see compile-backend-binaries.mts.
# renovate: datasource=npm depName=bun
ARG BUN_VERSION=1.4.4
RUN npm install -g pnpm@${PNPM_VERSION} bun@${BUN_VERSION}

# Copy the root dependency contract first. Workspace manifests follow before the one
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

# lingua-rs downloads its native binding from GitHub Releases in its postinstall. By default a
# failed download only warns and exits 0, which ships an image with no binding (#1704). Strict
# mode makes that install fail instead. Image builds only; local installs stay best-effort.
ENV LINGUA_RS_STRICT_INSTALL=1

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
# @services/runtime-request-validation and @voucha/mcp (MCP output schemas)
# import @voucha/api-fixtures: request validation loads request-contracts.json,
# and admin tool response schemas load the same request bundle. Other files are test and client fixture
# payload that the compiled executables don't need.
COPY api-fixtures/v1/request-contracts.json ./api-fixtures/v1/
COPY email-templates/ ./email-templates/
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
    node backend/services/localization/compile-cli.mts --source localization/catalog --output /app/localization/catalog.sqlite

# Compile api, worker-io, and worker-cpu into /out with the migration, view, Lua, and schema
# files they read embedded, plus the shared libraries their native addons load in /out/lib.
RUN bun backend/scripts/build/compile-backend-binaries.mts /out

# Stage 2a: Production runtime — API server.
# Distroless: no shell, no apt, no package managers. The executable also runs the operational
# entrypoints that ECS task overrides name (migrate.mts, schema-reset.mts, valkey-admin.mts,
# verify-ipv6-egress.mts).
FROM runtime-base AS api

ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
ENV NODE_ENV=production
# Embedded native addons run from temporary copies, which must land in a directory the nonroot
# user can write.
ENV TMPDIR=/tmp

WORKDIR /app/backend

COPY --link --from=builder --chown=65532:65532 /out/lib/libduckdb.so /app/backend/lib/
COPY --link --from=builder --chown=65532:65532 /app/localization/catalog.sqlite /app/localization/catalog.sqlite
COPY --link --from=builder --chown=65532:65532 /out/api /app/backend/api

ENV LD_LIBRARY_PATH=/app/backend/lib
ENV LOCALIZATION_SQLITE_PATH=/app/localization/catalog.sqlite

# Expose default port
EXPOSE 3000

# No HEALTHCHECK here — add one in your orchestration layer:
#   ECS task definition: ["CMD", "/app/backend/api", "healthcheck.mts"]
#   Kubernetes:          livenessProbe / readinessProbe
#   Docker Compose:      healthcheck: section
#   docker run:          --health-cmd

ENTRYPOINT ["/app/backend/api"]
CMD ["serve.mts"]

# sort and comm for both worker images. Copied from the upgraded trixie root (same
# glibc as the distroless runtime) together with the shared libraries ldd reports,
# so the image stays distroless: no shell and no apt. The api image does not receive
# this tree. Paths are canonicalized with readlink -f. Distroless /lib and /lib64 are
# symlinks (usrmerge), and COPY refuses to put a directory on top of those symlinks.
FROM base-node AS worker-io-cli
RUN set -eu; \
    root=/worker-io-cli; \
    mkdir -p "$root"; \
    copy_path() { \
      path="$1"; \
      [ -e "$path" ] || return 0; \
      resolved="$(readlink -f "$path")"; \
      mkdir -p "$root$(dirname "$resolved")"; \
      cp -a "$resolved" "$root$resolved"; \
      if [ "$resolved" != "$path" ] && [ -L "$path" ]; then \
        case "$path" in \
          /lib/*|/lib64/*) ;; \
          *) \
            mkdir -p "$root$(dirname "$path")"; \
            cp -a "$path" "$root$path"; \
            ;; \
        esac; \
      fi; \
    }; \
    copy_path /usr/bin/sort; \
    copy_path /usr/bin/comm; \
    ldd /usr/bin/sort /usr/bin/comm > /tmp/worker-io-cli-ldd.txt; \
    awk '$2 == "=>" && $3 ~ /^\// { print $3 } $1 ~ /^\// { print $1 }' /tmp/worker-io-cli-ldd.txt > /tmp/worker-io-cli-libs-raw.txt; \
    sort -u /tmp/worker-io-cli-libs-raw.txt > /tmp/worker-io-cli-libs.txt; \
    while IFS= read -r lib; do \
      copy_path "$lib"; \
    done < /tmp/worker-io-cli-libs.txt; \
    mkdir -p "$root/tmp"; \
    chmod 1777 "$root/tmp"

# Proves the copied binaries run as nonroot on the distroless glibc through the
# typed wrapper. The bake plan builds this target with the backend images.
FROM runtime-base AS worker-io-cli-smoke
COPY --from=worker-io-cli /worker-io-cli/ /
COPY --from=builder --chown=65532:65532 /out/worker-io /app/backend/worker-io
ENV TMPDIR=/tmp
WORKDIR /app
RUN ["/app/backend/worker-io", "cli-smoke.mts"]

# Stage 2b: Production runtime — CPU worker (Rust NAPI, sharp).
# Lightpanda browser crawling connects to Lightpanda's cloud CDP endpoint over
# Playwright (LIGHTPANDA_CDP_URL/LIGHTPANDA_TOKEN) — no local browser binary.
# Sized for a 512 CPU / 1024 MiB Fargate task (4 libuv threads).
# Distroless: no shell, no apt, no package managers.
FROM runtime-base AS worker-cpu

ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
ENV NODE_ENV=production
ENV UV_THREADPOOL_SIZE=4
ENV RUST_TOKIO_WORKER_THREADS=2
ENV RUST_TOKIO_MAX_BLOCKING_THREADS=2
ENV RAYON_NUM_THREADS=2
# GNU sort spills to TMPDIR. On Fargate this is the task's writable ephemeral storage.
ENV TMPDIR=/tmp

WORKDIR /app/backend

COPY --from=worker-io-cli /worker-io-cli/ /
COPY --link --from=builder --chown=65532:65532 /out/lib/ /app/backend/lib/
COPY --link --from=builder --chown=65532:65532 /app/localization/catalog.sqlite /app/localization/catalog.sqlite
COPY --link --from=builder --chown=65532:65532 /out/worker-cpu /app/backend/worker-cpu

ENV LD_LIBRARY_PATH=/app/backend/lib
ENV LOCALIZATION_SQLITE_PATH=/app/localization/catalog.sqlite

ENTRYPOINT ["/app/backend/worker-cpu"]
CMD ["serve.mts"]

# Proves the worker-cpu image runs the same sort and comm binaries as nonroot
# through the typed wrapper. It inherits the CLI tree and TMPDIR from worker-cpu.
FROM worker-cpu AS worker-cpu-cli-smoke
WORKDIR /app
RUN ["/app/backend/worker-cpu", "cli-smoke.mts"]

# Stage 2c: Production runtime — IO worker (IO-only).
# Sized for a 256 CPU / 512 MiB Fargate task (4 libuv threads).
# Distroless: no shell, no apt, no package managers.
FROM runtime-base AS worker-io

ARG GIT_COMMIT
ENV GIT_COMMIT=$GIT_COMMIT
ENV NODE_ENV=production
ENV UV_THREADPOOL_SIZE=4
ENV RUST_TOKIO_WORKER_THREADS=2
ENV RUST_TOKIO_MAX_BLOCKING_THREADS=2
ENV RAYON_NUM_THREADS=2
# GNU sort spills to TMPDIR. On Fargate this is the task's writable ephemeral storage.
ENV TMPDIR=/tmp

WORKDIR /app/backend

COPY --from=worker-io-cli /worker-io-cli/ /
COPY --link --from=builder --chown=65532:65532 /out/lib/libduckdb.so /app/backend/lib/
COPY --link --from=builder --chown=65532:65532 /app/localization/catalog.sqlite /app/localization/catalog.sqlite
COPY --link --from=builder --chown=65532:65532 /out/worker-io /app/backend/worker-io

ENV LD_LIBRARY_PATH=/app/backend/lib
ENV LOCALIZATION_SQLITE_PATH=/app/localization/catalog.sqlite

ENTRYPOINT ["/app/backend/worker-io"]
CMD ["serve.mts"]
