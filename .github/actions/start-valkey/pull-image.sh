#!/usr/bin/env bash
set -euo pipefail
trap 'exit 130' INT
trap 'exit 143' TERM

image="${1:?Expected the action-owned Valkey image pin}"
if ! [[ "$image" =~ ^mirror\.gcr\.io/valkey/valkey-bundle:[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$ ]]; then
  echo "Expected the digest-pinned Valkey mirror reference" >&2
  exit 2
fi

logs="$(mktemp -d "${RUNNER_TEMP:-/tmp}/valkey-pull.XXXXXX")"
echo "Valkey pull diagnostics: $logs" >&2
pull_image() {
  local reference="$1" log="$2" status
  local -a command=(docker pull "$reference")
  if [ "$reference" = "$image" ]; then
    # Leave canonical acquisition time inside the action-owned 50s total deadline.
    # USR1 marks our deadline separately from arbitrary Docker exits or cancellation.
    # Foreground mode keeps the CLI in the outer timeout's cancellation group;
    # the local deadline kills/reaps only that CLI, never the shared Docker daemon.
    command=(timeout --foreground --signal=USR1 --kill-after=2s 35s bash -c '
      marker="$1"; shift
      trap '\''touch "$marker"; kill -KILL "$pull" 2>/dev/null; wait "$pull"; exit 124'\'' USR1
      trap '\''trap "" TERM INT; kill -TERM "$pull" 2>/dev/null; wait "$pull"; exit 143'\'' TERM
      trap '\''trap "" TERM INT; kill -TERM "$pull" 2>/dev/null; wait "$pull"; exit 130'\'' INT
      "$@" &
      pull=$!
      wait "$pull"
    ' _ "$logs/mirror-deadline" "${command[@]}")
  fi
  local -a statuses
  # The action owns one deadline across both attempts. Stream diagnostics even on cancellation.
  if "${command[@]}" 2>&1 | tee "$log" >&2; then
    return 0
  else
    statuses=("${PIPESTATUS[@]}")
    status="${statuses[0]}"
    if [ "${statuses[1]}" -ne 0 ]; then
      echo "Valkey pull diagnostics failed (docker=$status, tee=${statuses[1]})" >&2
      return 125
    fi
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

# Only our mirror deadline or the two observed content errors permit fallback.
# Authentication, transport, daemon, and unknown failures remain failures.
last_line="$(sed '/^[[:space:]]*$/d' "$logs/mirror.log" | tail -n 1)"
if { [ "$status" -eq 124 ] || [ "$status" -eq 137 ]; } && [ -f "$logs/mirror-deadline" ]; then
  echo "Mirror acquisition deadline reached; reserving the remaining budget for canonical" >&2
elif [ "$status" -ne 1 ] || ! [[ "$last_line" =~ ^(docker:\ )?(Error\ response\ from\ daemon:\ )?(unknown\ blob|error\ pulling\ image\ configuration:\ download\ failed\ after\ attempts=[1-9][0-9]*:\ unknown\ blob)$ ]]; then
  exit "$status"
fi

canonical="docker.io/${image#mirror.gcr.io/}"
echo "Trying canonical registry once with the same digest" >&2
if pull_image "$canonical" "$logs/canonical.log"; then
  printf '%s\n' "$canonical"
else
  exit $?
fi
