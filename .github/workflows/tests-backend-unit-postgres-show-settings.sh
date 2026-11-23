# Proves on passing runs that the lock-diagnostic settings reached the server.
docker exec "$POSTGRES_CONTAINER" psql -U postgres --no-psqlrc --set=ON_ERROR_STOP=1 \
  --command='SHOW log_lock_waits' --command='SHOW deadlock_timeout' \
  --command='SHOW log_line_prefix' --command='SHOW log_min_error_statement' \
  --command='SHOW log_min_messages'
