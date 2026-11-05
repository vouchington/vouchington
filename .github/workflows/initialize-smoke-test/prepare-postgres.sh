#!/usr/bin/env bash
pg_container="voucha-postgres-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${GITHUB_JOB}"
if ! command -v psql >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y --no-install-recommends postgresql-client
fi
docker run -d \
  --name "$pg_container" \
  -e POSTGRES_DB=postgres \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_INITDB_ARGS="-c max_connections=300 -c log_min_messages=log" \
  -p "127.0.0.1::5432" \
  ghcr.io/vouchington/dependency-pgvector:pg18@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62
PGPORT=$(docker port "$pg_container" 5432 | cut -d: -f2)
if [ -z "$PGPORT" ]; then echo "::error::Failed to retrieve Postgres host port from docker"; exit 1; fi
export PGHOST=localhost
export PGPORT
export PGUSER=postgres
source "$SMOKE_WORKTREE/dev/lib/worktree-resource-env.sh"
smoke_db_name=$(worktree_resource_owned_db_name "$SMOKE_WORKTREE")
export DATABASE_URL="postgres://postgres@localhost:${PGPORT}/${smoke_db_name}"
echo "DATABASE_URL=$DATABASE_URL" >> "$GITHUB_ENV"
for _attempt in $(seq 1 10); do
  if pg_isready; then
    break
  fi
  sleep 1
done
pg_isready
