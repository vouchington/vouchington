#!/usr/bin/env bash
# Restores the seed job's dump into a shard's PostgreSQL in two phases.
#   data: schema and table data, in parallel, without materialized view data.
#   materialized-views: view data in dump order, then ANALYZE.
# Refreshing a view before any ANALYZE plans it blind; mv_trending_communities then ran
# past the restore deadline, so view data waits until the statistics step has run.
set -euo pipefail
dump_dir="$RUNNER_TEMP/explain-seeded"
pg() { docker run --rm --network host -v "$dump_dir:/dump:ro" "$PG_IMAGE" "$@"; }
restore_flags=(--dbname="$DATABASE_URL" --exit-on-error --no-owner --no-privileges)
case "${1:-}" in
  data)
    pg pg_restore --list /dump/explain-seeded.dump > "$dump_dir/all.list"
    grep -v ' MATERIALIZED VIEW DATA ' "$dump_dir/all.list" > "$dump_dir/schema-and-data.list"
    grep ' MATERIALIZED VIEW DATA ' "$dump_dir/all.list" > "$dump_dir/materialized-views.list" || true
    pg pg_restore "${restore_flags[@]}" --jobs=4 --use-list=/dump/schema-and-data.list \
      /dump/explain-seeded.dump
    ;;
  materialized-views)
    pg pg_restore "${restore_flags[@]}" --use-list=/dump/materialized-views.list \
      /dump/explain-seeded.dump
    pg psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'ANALYZE'
    ;;
  *)
    echo "usage: $0 data|materialized-views" >&2
    exit 2
    ;;
esac
