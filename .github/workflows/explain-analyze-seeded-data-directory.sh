#!/usr/bin/env bash
# Hands the seed job's PostgreSQL data directory to each shard unchanged.
#   save: cleanly stop the seed's service container and archive its data directory.
#   start: unpack the archive into a volume and start PostgreSQL on it; exports DATABASE_URL.
# A pg_dump restore rebuilt every heap and index, so page counts, index creation order and the
# visibility map differed from the seeded database, and near-tie plans flipped (run 42935086140).
# A copy of the stopped server keeps all of those, the cumulative statistics written at shutdown,
# and the postgresql.conf settings initdb wrote, so a shard plans like the seeded server.
set -euo pipefail
archive_dir="$RUNNER_TEMP/explain-seeded"
archive="$archive_dir/explain-seeded-pgdata.tar.zst"
data_root=/var/lib/postgresql
case "${1:-}" in
  save)
    # The image stops on SIGINT, a fast shutdown that writes a final checkpoint.
    docker stop --time 120 "$POSTGRES_CONTAINER_ID" >/dev/null
    state="$(docker run --rm --user postgres --volumes-from "$POSTGRES_CONTAINER_ID" "$PG_IMAGE" \
      sh -c 'pg_controldata "$PGDATA"' | sed -n 's/^Database cluster state: *//p')"
    if [[ "$state" != 'shut down' ]]; then
      echo "::error::Seed PostgreSQL stopped in state '$state', not 'shut down'"
      exit 1
    fi
    mkdir -p "$archive_dir"
    docker run --rm --volumes-from "$POSTGRES_CONTAINER_ID" "$PG_IMAGE" \
      tar -C "$data_root" -cf - . | zstd -T0 -3 -q -o "$archive"
    ls -l "$archive"
    ;;
  start)
    docker volume create explain-pgdata >/dev/null
    zstd -dc "$archive" | docker run --rm -i -v "explain-pgdata:$data_root" "$PG_IMAGE" \
      tar -C "$data_root" -xpf -
    rm -f "$archive"
    # The data directory exists, so the entrypoint skips initdb and starts the server.
    # Autovacuum stays on, as on the seeded server: scenario fixtures bulk-load tables whose
    # insert triggers rely on autoanalyze between batches. With it off, the agent moderation
    # retention load kept the seed's row estimate and timed out (run 42961618382).
    docker run -d --name explain-postgres -p 127.0.0.1::5432 -v "explain-pgdata:$data_root" \
      "$PG_IMAGE" >/dev/null
    readiness_command='until docker exec "$0" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1; do sleep 0.5; done'
    if ! timeout 60 sh -c "$readiness_command" explain-postgres; then
      echo "::error::PostgreSQL did not accept connections within 60s"
      docker logs explain-postgres 2>&1 | tail -n 50
      exit 1
    fi
    port="$(docker port explain-postgres 5432/tcp | head -n 1 | sed 's/.*://')"
    if ! [[ "$port" =~ ^[0-9]+$ ]]; then
      echo "::error::Could not resolve the published PostgreSQL host port"
      exit 1
    fi
    echo "DATABASE_URL=postgres://postgres@127.0.0.1:${port}/postgres" >> "$GITHUB_ENV"
    ;;
  *)
    echo "usage: $0 save|start" >&2
    exit 2
    ;;
esac
