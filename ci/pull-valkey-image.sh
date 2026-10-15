#!/usr/bin/env bash
set -euo pipefail

image="${1:?Expected the action-owned Valkey image pin}"
if ! [[ "$image" =~ ^mirror\.gcr\.io/valkey/valkey-bundle:[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$ ]]; then
  echo "Expected the digest-pinned Valkey mirror reference" >&2
  exit 2
fi

logs="$(mktemp -d "${RUNNER_TEMP:-/tmp}/valkey-pull.XXXXXX")"
echo "Valkey pull diagnostics: $logs" >&2
pull_image() {
  local reference="$1" log="$2" status
  # Two 20s pulls plus termination margins leave the existing 60s readiness budget intact.
  if timeout --kill-after=2s 20s docker pull "$reference" >"$log" 2>&1; then
    cat "$log" >&2
    return 0
  else
    status=$?
    cat "$log" >&2
    echo "Valkey pull exited $status ($reference)" >&2
    return "$status"
  fi
}

if pull_image "$image" "$logs/mirror.log"; then
  printf '%s\n' "$image"
  exit 0
else
  status=$?
fi

# Only the two observed registry content errors permit fallback. Authentication, transport,
# daemon, timeout, and unknown failures remain failures, including a non-final matching line.
last_line="$(sed '/^[[:space:]]*$/d' "$logs/mirror.log" | tail -n 1)"
if [ "$status" -ne 1 ] || ! [[ "$last_line" =~ ^(docker:\ )?(Error\ response\ from\ daemon:\ )?(unknown\ blob|error\ pulling\ image\ configuration:\ download\ failed\ after\ attempts=[1-9][0-9]*:\ unknown\ blob)$ ]]; then
  exit "$status"
fi

canonical="docker.io/${image#mirror.gcr.io/}"
echo "Mirror image content unavailable; trying canonical registry once with the same digest" >&2
if pull_image "$canonical" "$logs/canonical.log"; then
  printf '%s\n' "$canonical"
else
  exit $?
fi
