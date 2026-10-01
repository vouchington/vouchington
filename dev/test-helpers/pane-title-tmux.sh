#!/bin/bash
# Stable tmux stand-in for post-tool reminder tests. Executing a script that
# the test just wrote can fail with ETXTBSY, which the reminder treats as an
# empty pane title and a missing -pr<N> suffix.
if [ "${1:-}" != "display-message" ]; then
  exit 1
fi
printf '%s\n' "${VOUCHA_FAKE_PANE_TITLE-}"
