#!/bin/bash
printf 'pgrep %s\n' "$*" >> "${FAKE_TMUX_LOG:?}"
if [ "$1" != "-P" ] || [ -z "${2:-}" ] || [ -z "${3:-}" ]; then
  echo 'pgrep: pattern required' >&2
  exit 2
fi
pid="$2"
window=''
case "$pid" in
  1101) window=nextjs ;;
  1102) window=backend ;;
  1103) window=worker ;;
  1104) window=cloudflare ;;
  1105) window=lambdas ;;
  *) exit 1 ;;
esac
case " ${FAKE_TMUX_DEAD_WINDOWS:-} " in
  *" $window "*) exit 1 ;;
esac
exit 0
