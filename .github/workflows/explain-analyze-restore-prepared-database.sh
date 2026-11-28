#!/usr/bin/env bash
# Restores the prepared backend dump into the seed job's PostgreSQL service container.
set -euo pipefail
docker run --rm --network host -i \
  ghcr.io/vouchington/dependency-pgvector:pg18@sha256:38681dc6eaf55308e2a4c6de392d131652dcfac70e1263e35cd9b5ea3fe39782 \
  pg_restore --dbname="$DATABASE_URL" --exit-on-error --no-owner --no-privileges \
  <"$RUNNER_TEMP/backend-postgres.dump"
