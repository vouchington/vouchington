#!/usr/bin/env bash
# Runs one command in the background so later steps of the same job overlap with it.
#   begin NAME COMMAND...: start the command detached; the step returns at once.
#   finish NAME: wait for it, print its output, and fail the step if the command failed.
# The job holds an exclusive lock on NAME.lock for as long as the command runs, so `finish` waits on
# the process itself with flock rather than watching any remote state.
set -euo pipefail
directory="$RUNNER_TEMP/explain-background"
action="${1:-}"
name="${2:-}"
if [[ -z "$name" ]]; then
  echo "usage: $0 begin NAME COMMAND... | finish NAME" >&2
  exit 2
fi
case "$action" in
  begin)
    shift 2
    mkdir -p "$directory"
    rm -f "$directory/$name.status"
    exec 9>"$directory/$name.lock"
    flock 9
    # The detached subshell inherits descriptor 9 and keeps the lock until the command ends. Its
    # output goes to files so the runner does not wait for this step's pipes to close.
    (
      status=0
      "$@" >"$directory/$name.log" 2>&1 || status=$?
      echo "$status" >"$directory/$name.status"
    ) </dev/null >/dev/null 2>&1 &
    ;;
  finish)
    if [[ ! -e "$directory/$name.lock" ]]; then
      echo "::error::Background command $name was never started"
      exit 1
    fi
    flock "$directory/$name.lock" true
    cat "$directory/$name.log"
    if [[ "$(cat "$directory/$name.status" 2>/dev/null || echo missing)" != 0 ]]; then
      echo "::error::Background command $name failed"
      exit 1
    fi
    ;;
  *)
    echo "usage: $0 begin NAME COMMAND... | finish NAME" >&2
    exit 2
    ;;
esac
