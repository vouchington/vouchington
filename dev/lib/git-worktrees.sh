#!/usr/bin/env bash

# Generic worktree parsing and canonical identity are published by vouchington-tooling.
_worktree_tooling_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
_worktree_tooling_script="$_worktree_tooling_root/node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh"
if [ ! -r "$_worktree_tooling_script" ]; then
  # Recovery commands must also work after node_modules has been removed.
  # shellcheck source=dev/lib/git-worktrees-recovery.sh
  source "$(dirname "${BASH_SOURCE[0]}")/git-worktrees-recovery.sh"
else
  # shellcheck source=/dev/null
  source "$_worktree_tooling_script"
fi
unset _worktree_tooling_root _worktree_tooling_script
