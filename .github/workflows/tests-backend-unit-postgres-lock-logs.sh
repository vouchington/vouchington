# Saves the Postgres service container log for upload and prints a bounded lock summary.
# The log is the container's stderr; run only after a failed job.
docker logs "$POSTGRES_CONTAINER" > backend-postgres.log 2>&1 || true
echo "PostgreSQL log: $(wc -l < backend-postgres.log) lines (full log uploaded as an artifact)"
echo "::group::PostgreSQL deadlocks and lock waits"
grep -E -B2 -A12 'deadlock detected|still waiting for' backend-postgres.log | head -n 400 || true
echo "::endgroup::"
