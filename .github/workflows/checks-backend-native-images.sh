#!/usr/bin/env bash
# Each image uses its shipping entrypoint, user, TMPDIR and library path. No cloud or stores.
set -euo pipefail

cleanup() {
  for target in api worker-cpu worker-io; do
    docker rm -f "voucha-native-$target-$$" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

for target in api worker-cpu worker-io; do
  arguments=()
  if [[ "$target" == worker-io ]]; then arguments+=(io); fi
  timeout 30s docker run --rm --network none --name "voucha-native-$target-$$" \
    "voucha-native/$target:smoke" image-smoke.mts "${arguments[@]}"
done
