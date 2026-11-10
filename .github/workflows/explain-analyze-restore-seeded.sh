#!/usr/bin/env bash
# Moves the seed job's database into each shard with the seed's planner inputs intact.
#   dump: custom-format dump that carries the seed's planner statistics (PostgreSQL 18).
#   data: schema, table data and statistics, in parallel, without materialized view data.
#   settle: rebuild visibility maps on the tables the seed had analyzed.
#   materialized-views: view data in dump order, then VACUUM (ANALYZE) on the views only.
# The seed analyzes only the tables it fills. A database-wide ANALYZE marks every other table
# as known-empty, where the seeded run leaves it never-analyzed, and that flipped 17 plan
# contracts to sequential scans (run 42723948597). Refreshing views before their sources have
# statistics plans them blind; mv_trending_communities then ran past the restore deadline.
set -euo pipefail
dump_dir="$RUNNER_TEMP/explain-seeded"
pg() { docker run --rm --network host -v "$dump_dir:/dump" "$PG_IMAGE" "$@"; }
restore_flags=(--dbname="$DATABASE_URL" --exit-on-error --no-owner --no-privileges)
# Runs one VACUUM per matching relation in a single session; VACUUM cannot share a transaction.
vacuum_matching() {
  docker run --rm -i --network host "$PG_IMAGE" psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
SELECT format('VACUUM $1 public.%I', c.relname) FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND $2
ORDER BY c.relname \\gexec
SQL
}
case "${1:-}" in
  dump)
    mkdir -p "$dump_dir"
    pg pg_dump --format=custom --no-owner --no-privileges --statistics \
      --file=/dump/explain-seeded.dump "$DATABASE_URL"
    ;;
  data)
    pg pg_restore --list /dump/explain-seeded.dump > "$dump_dir/all.list"
    grep -v ' MATERIALIZED VIEW DATA ' "$dump_dir/all.list" > "$dump_dir/schema-and-data.list"
    grep ' MATERIALIZED VIEW DATA ' "$dump_dir/all.list" > "$dump_dir/materialized-views.list" || true
    pg pg_restore "${restore_flags[@]}" --jobs=4 --use-list=/dump/schema-and-data.list \
      /dump/explain-seeded.dump
    ;;
  settle)
    vacuum_matching '(ANALYZE)' "c.relkind IN ('r', 'p', 'm')"
    ;;
  materialized-views)
    pg pg_restore "${restore_flags[@]}" --use-list=/dump/materialized-views.list \
      /dump/explain-seeded.dump
    vacuum_matching '(ANALYZE)' "c.relkind = 'm'"
    ;;
  *)
    echo "usage: $0 dump|data|settle|materialized-views" >&2
    exit 2
    ;;
esac
