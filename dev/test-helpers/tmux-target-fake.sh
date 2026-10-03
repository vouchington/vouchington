#!/usr/bin/env bash
set -euo pipefail

if [ -n "${FAKE_TMUX_LOG:-}" ]; then
  printf '%s\n' "$*" >> "$FAKE_TMUX_LOG"
fi
if [ "${1:-}" != -S ] || [ -z "${2:-}" ]; then
  exit 1
fi
shift 2
case ${1:-} in
  display-message)
    if [ "${FAKE_TMUX_PANE_MISSING:-}" = 1 ]; then exit 1; fi
    case ${5:-} in
      '#{pane_current_path}') printf '%s\n' "${FAKE_TMUX_PANE_PATH:-}" ;;
      '#{pane_title}') printf '%s\n' "${FAKE_TMUX_TITLE:-}" ;;
      *) exit 1 ;;
    esac ;;
  rename-window|select-pane|set-window-option) exit 0 ;;
  *) exit 1 ;;
esac
