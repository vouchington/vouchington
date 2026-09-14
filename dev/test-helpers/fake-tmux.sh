#!/bin/bash
log="${FAKE_TMUX_LOG:?}"
printf '%s\n' "$*" >> "$log"

default_windows='nextjs backend worker cloudflare lambdas'
windows=${FAKE_TMUX_WINDOWS:-$default_windows}

pane_pid_for() {
  case "$1" in
    nextjs) printf '1101\n' ;;
    backend) printf '1102\n' ;;
    worker) printf '1103\n' ;;
    cloudflare) printf '1104\n' ;;
    lambdas) printf '1105\n' ;;
    *) return 1 ;;
  esac
}

window_from_target() {
  local target="${1:-}"
  target="${target##*:}"
  printf '%s\n' "${target%%.*}"
}

window_listed() {
  case " $windows " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

if [ "$1" = "has-session" ]; then
  if [ "${FAKE_TMUX_RACE:-}" = "1" ]; then
    if [ -f "${FAKE_TMUX_STATE:?}" ]; then exit 0; fi
    : > "${FAKE_TMUX_STATE:?}"
    exit 1
  fi
  exit "${FAKE_TMUX_HAS_SESSION_EXIT:-1}"
fi
if [ "$1" = "show-options" ]; then
  if [ -n "${FAKE_TMUX_READY_AFTER:-}" ]; then
    count_file="${FAKE_TMUX_LOG}.ready-count"
    count=0
    if [ -f "$count_file" ]; then read -r count < "$count_file"; fi
    count=$((count + 1))
    printf '%s\n' "$count" > "$count_file"
    if [ "$count" -lt "$FAKE_TMUX_READY_AFTER" ]; then exit 1; fi
  fi
  printf '1\n'
  exit 0
fi
if [ "$1" = "show-environment" ]; then
  if [ -f "$log.owner" ]; then /bin/cat "$log.owner"; exit 0; fi
  exit 1
fi
if [ "$1" = "list-windows" ]; then
  # shellcheck disable=SC2086
  printf '%s\n' $windows
  exit 0
fi
if [ "$1" = "list-panes" ]; then
  target=''
  shift
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -t)
        target="$2"
        shift 2
        ;;
      *) shift ;;
    esac
  done
  window="$(window_from_target "$target")"
  if ! window_listed "$window"; then exit 1; fi
  pane_pid_for "$window" || exit 1
  exit 0
fi
if [ "$1" = "respawn-pane" ]; then
  if [ -n "${FAKE_TMUX_RESPAWN_FAIL:-}" ]; then
    case " $* " in
      *" $FAKE_TMUX_RESPAWN_FAIL "* | *" $FAKE_TMUX_RESPAWN_FAIL."*) exit 1 ;;
    esac
  fi
  exit 0
fi
if [ "$1" = "new-session" ] && [ -n "${FAKE_TMUX_NEW_SESSION_EXIT:-}" ]; then exit "$FAKE_TMUX_NEW_SESSION_EXIT"; fi
if [ "$1" = "new-session" ]; then
  for arg in "$@"; do
    case "$arg" in VOUCHA_LAUNCHER_PID=*) printf '%s\n' "$arg" > "$log.owner" ;; esac
  done
  if [ "${FAKE_TMUX_SIGNAL_NEW_SESSION:-}" = "1" ]; then kill -TERM "$PPID"; fi
fi
if [ "$1" = "new-window" ] && [ -n "${FAKE_TMUX_FAIL_WINDOW:-}" ] && [[ " $* " == *" -n $FAKE_TMUX_FAIL_WINDOW "* ]]; then exit 1; fi
if [ "$1" = "kill-session" ]; then exit 0; fi
if [ "$1" = "display-message" ]; then printf 'voucha-test\n'; fi
if [ "${FAKE_TMUX_EXECUTE_COMMANDS:-}" = "1" ] && { [ "$1" = "new-session" ] || [ "$1" = "new-window" ]; }; then
  shift
  pane_name=''
  pane_cwd=''
  pane_command=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      -c)
        pane_cwd="$2"
        shift 2
        ;;
      -n)
        pane_name="$2"
        shift 2
        ;;
      -s | -t | -e) shift 2 ;;
      -d) shift ;;
      *)
        pane_command="$1"
        shift
        ;;
    esac
  done
  if [ -n "$pane_command" ]; then
    printf '\n' | (cd "${pane_cwd:-.}" && /bin/sh -c "$pane_command")
    printf '%s\t%s\n' "$pane_name" "$?" >> "${FAKE_TMUX_STATUS_LOG:?}"
  fi
  exit 0
fi
