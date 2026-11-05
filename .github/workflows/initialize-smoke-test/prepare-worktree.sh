#!/usr/bin/env bash
set -euo pipefail
smoke_root="$RUNNER_TEMP/voucha-initialize-smoke/worktrees/${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}-${GITHUB_JOB}"
smoke_worktree="$smoke_root/voucha"
mkdir -p "$smoke_root"
git worktree add --detach "$smoke_worktree" HEAD

if [ ! -f "$smoke_worktree/.git" ]; then
  echo "::error::Expected disposable checkout to be a linked worktree"
  exit 1
fi
case "$smoke_worktree" in
  */worktrees/*) ;;
  *)
    echo "::error::Disposable worktree path must contain /worktrees/ for isolated dev resources"
    exit 1
    ;;
esac

echo "SMOKE_WORKTREE=$smoke_worktree" >> "$GITHUB_ENV"
