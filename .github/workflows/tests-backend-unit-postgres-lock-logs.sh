# Saves the Postgres service container log for upload and prints a bounded lock summary.
# The log is the container's stderr; run only after a failed job.
docker logs "$POSTGRES_CONTAINER" > backend-postgres.log 2>&1 || true
echo "PostgreSQL log: $(wc -l < backend-postgres.log) lines (full log uploaded as an artifact)"
echo "::group::PostgreSQL deadlocks and lock waits"
grep -E -B2 -A12 'deadlock detected|still waiting for' backend-postgres.log | head -n 400 || true
echo "::endgroup::"

if ! docker exec "$POSTGRES_CONTAINER" psql -U postgres -d postgres --no-psqlrc --set=ON_ERROR_STOP=1 --csv \
  --command='/* backendUnitRelationOids */ SELECT c.oid, n.nspname AS schema, c.relname AS relation FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace ORDER BY c.oid LIMIT 10000' \
  > backend-postgres-relations.csv; then
  rm -f backend-postgres-relations.csv
  echo '::warning::PostgreSQL relation OID map unavailable'
fi
