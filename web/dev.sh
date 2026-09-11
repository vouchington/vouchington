#!/usr/bin/env bash
set -euo pipefail

# nextjs caching causes so many problems
rm -rf .next node_modules/.cache

# If NEXT_PORT is not set, try to load it from the parent .env (worktree-level).
if [ -z "${NEXT_PORT:-}" ] && [ -f ../.env ]; then
  set +u
  # shellcheck source=/dev/null
  . ../.env
  set -u
fi

: "${NEXT_PORT:=3001}"
# NEXT_PORT may be allocated near the top of the ephemeral range (>64535); adding 1000
# would overflow 65535, so subtract 1000 instead in that case.
: "${STORYBOOK_PORT:=$(( NEXT_PORT + 1000 <= 65535 ? NEXT_PORT + 1000 : NEXT_PORT - 1000 ))}"

storybook_pid=""
next_pid=""

cleanup() {
  if [ -n "$next_pid" ]; then
    kill "$next_pid" >/dev/null 2>&1 || true
  fi
  if [ -n "$storybook_pid" ]; then
    kill "$storybook_pid" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

if [ "${STORYBOOK_DISABLED:-}" != "true" ]; then
  pnpm exec storybook dev \
    --port "$STORYBOOK_PORT" \
    --host 127.0.0.1 \
    --no-open \
    --disable-telemetry \
    > "${TMPDIR:-/tmp}/voucha-storybook-${STORYBOOK_PORT}.log" 2>&1 &
  storybook_pid=$!
  sleep 2
  if ! kill -0 "$storybook_pid" >/dev/null 2>&1; then
    cat "${TMPDIR:-/tmp}/voucha-storybook-${STORYBOOK_PORT}.log" >&2 || true
    echo "Storybook failed to start on port ${STORYBOOK_PORT}" >&2
    exit 1
  fi
fi

next dev --port "$NEXT_PORT" "$@" &
next_pid=$!
wait "$next_pid"
