#!/usr/bin/env bash
set -o pipefail
resource_prefix='[backend-unit-resources]'
postgres_wait_prefix='[backend-unit-pg-waits]'
pressure_prefix='[backend-unit-pressure]'
prefix_lines() {
  while IFS= read -r line || [ -n "$line" ]; do
    printf '%s %s\n' "$1" "$line"
  done
}
sample_runner_resources() {
  {
    date -u +%Y-%m-%dT%H:%M:%SZ
    free -m
    df -h "$GITHUB_WORKSPACE"
    df -h -t tmpfs
    # head closes the pipe, so ps exits on SIGPIPE. That is not a sample failure.
    ps -eo pid,rss,pmem,comm --sort=-rss | head -n 15 || true
  } 2>&1 | prefix_lines "$resource_prefix"
}
# Prints a row only for a blocked or blocking backend, or one statement running 1.5s or longer.
sample_postgres_waits() {
  command -v psql >/dev/null 2>&1 || return 0
  PGAPPNAME=ci-pg-wait-sampler PGCONNECT_TIMEOUT=3 PGOPTIONS='-c statement_timeout=3000' \
    psql "$DATABASE_URL" -X -At -F '|' -f ci/backend-unit-pg-waits.sql 2>/dev/null |
    prefix_lines "$postgres_wait_prefix"
}
# vmstat columns end in us sy id wa st (user, system, idle, iowait, hypervisor steal).
sample_runner_pressure() {
  {
    date -u +%H:%M:%S
    vmstat 1 2 | tail -n 1
    for resource in cpu io memory; do
      if [ -r "/proc/pressure/$resource" ]; then
        printf '%s %s\n' "$resource" "$(head -n 1 "/proc/pressure/$resource")"
      fi
    done
  } 2>&1 | tr '\n' ' ' | prefix_lines "$pressure_prefix"
}
# Runs once, shortly before the step timeout kills this shell. The run is then
# stuck or only slow; the log names unfinished files with their running time, the
# slowest finished files, and the largest processes.
dump_deadline_state() {
  printf '[backend-unit-deadline] step deadline in 60s\n'
  node ci/backend-unit-unfinished-files.mts "$VITEST_FILE_PROGRESS_FILE" || true
  { ps -eo pid,rss,pmem,etime,args --sort=-rss | head -n 15 || true; } 2>&1 |
    prefix_lines '[backend-unit-deadline] ps'
}
sampler_pids=
start_deadline_dump() {
  (
    set +e
    set +o pipefail
    sleep_pid=
    # TERM can arrive after sleep starts but before sleep_pid=$! records it.
    # child_pid is assigned by the loop when the trap runs.
    # shellcheck disable=SC2154
    trap 'for child_pid in $(jobs -pr); do kill "$child_pid" 2>/dev/null || true; wait "$child_pid" 2>/dev/null || true; done; exit 0' TERM INT
    sleep "$DEADLINE_DUMP_AFTER_SECONDS" &
    sleep_pid=$!
    wait "${sleep_pid}" && dump_deadline_state
  ) &
  sampler_pids="${sampler_pids} $!"
}
start_sampler() {
  (
    set +e
    set +o pipefail
    sleep_pid=
    # child_pid is assigned by the loop when the trap runs.
    # shellcheck disable=SC2154
    trap 'for child_pid in $(jobs -pr); do kill "$child_pid" 2>/dev/null || true; wait "$child_pid" 2>/dev/null || true; done; exit 0' TERM INT
    while true; do
      "$1"
      sleep "$2" &
      sleep_pid=$!
      wait "${sleep_pid}"
      sleep_pid=
    done
  ) &
  sampler_pids="${sampler_pids} $!"
}
stop_samplers() {
  # TERM hits each sampler shell, which stops its sleep child before exiting.
  for sampler_pid in ${sampler_pids}; do
    kill -TERM "${sampler_pid}" 2>/dev/null || true
  done
  for sampler_pid in ${sampler_pids}; do
    wait "${sampler_pid}" 2>/dev/null || true
  done
  return 0
}
trap stop_samplers EXIT
start_deadline_dump
if [ "$VITEST_DIAGNOSTICS" = 1 ]; then
  start_sampler sample_runner_resources 15
  start_sampler sample_postgres_waits 0.5
  start_sampler sample_runner_pressure 2
fi
pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project backend/analytics-integration --project backend-data-stores --project backend-ai-usage-monthly-ddl --project backend-platform-stats-cache --project backend-mocks --project backend-migration-initializers --project backend-real-glide-mq --shard "$CI_SHARD" 2>&1 | tee backend-unit-output.log
node backend/test-helpers/api/request-query-profile-stale.mts --collect \
  "$CI_SHARD" backend-unit-output.log "$REQUEST_QUERY_PROFILE_HITS_FILE"
