#!/usr/bin/env bash
expected_shards="$EXPECTED_SHARDS"
if ! [[ "$expected_shards" =~ ^[1-9][0-9]*$ ]]; then
  echo "::error::Invalid backend-unit shard count: $expected_shards" >&2
  exit 2
fi
shopt -s nullglob
files=(backend-query-profile-hits/backend-query-profile-hits-shard-*.json)
if [ "${#files[@]}" -ne "$expected_shards" ]; then
  echo "::error::Expected $expected_shards query-profile hit manifests, found ${#files[@]}" >&2
  exit 2
fi
manifests=()
for ((shard = 1; shard <= expected_shards; shard++)); do
  manifests+=("backend-query-profile-hits/backend-query-profile-hits-shard-${shard}.json")
done
node backend/test-helpers/request-query-profile-manifest-check.mts "${manifests[@]}"
