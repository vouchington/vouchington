#!/usr/bin/env bash
mkdir -p backend/scripts/explain-analyze/output
# Monitor mode puts the loop in its own process group: killing only the
# subshell leaves sleep behind, and the runner's orphan cleanup can sit on
# "Terminate orphan process: (sleep)" after the seed step has finished.
set -m
(
  while :; do
    {
      printf 'sample_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
      printf 'host_cpu '; head -n 1 /proc/stat
      printf 'host_memory\n'; head -n 5 /proc/meminfo
      printf 'host_workspace_disk\n'; df -B1 "$GITHUB_WORKSPACE"
      printf 'postgres_container_stats\n'
      timeout 4s docker stats --no-stream --format '{{json .}}' "$POSTGRES_CONTAINER_ID" || true
      printf 'postgres_container_tmpfs\n'
      timeout 4s docker exec "$POSTGRES_CONTAINER_ID" df -B1 /var/lib/postgresql || true
    } >> backend/scripts/explain-analyze/output/seed-resources.txt 2>&1
    sleep 2
  done
) &
sampler_pid=$!
# status is assigned when the EXIT trap runs.
# shellcheck disable=SC2154
trap 'status=$?; kill -KILL -- -"$sampler_pid" 2>/dev/null || kill -KILL "$sampler_pid" 2>/dev/null || true; exit "$status"' EXIT
node backend/scripts/explain-analyze/seed.mts
