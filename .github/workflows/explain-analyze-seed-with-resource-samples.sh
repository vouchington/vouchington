#!/usr/bin/env bash
mkdir -p backend/scripts/explain-analyze/output
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
trap 'kill "$sampler_pid" 2>/dev/null || true; wait "$sampler_pid" 2>/dev/null || true' EXIT
node backend/scripts/explain-analyze/seed.mts
