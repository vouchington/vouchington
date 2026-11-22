#!/usr/bin/env bash
# Restores the prepared backend dump into the seed job's PostgreSQL service container.
set -euo pipefail
docker run --rm --network host -i \
  ghcr.io/vouchington/dependency-pgvector:pg18@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62 \
  pg_restore --dbname="$DATABASE_URL" --exit-on-error --no-owner --no-privileges \
  <"$RUNNER_TEMP/backend-postgres.dump"
