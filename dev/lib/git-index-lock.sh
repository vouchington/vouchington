#!/usr/bin/env bash
# Removes a 0-byte index.lock left behind by an interrupted `git maintenance run`
# (see docs/development/git-worktree-locks.md). Never removes a non-empty lock --
# a non-empty index.lock means a git process is genuinely mid-write.
# Note: git briefly creates a 0-byte lock before writing index content, so there
# is a theoretical race window (microseconds). Call this only when no concurrent
# git writes are expected, e.g. at the very start or end of a lifecycle script,
# before/after all git operations complete.
clear_stale_index_lock() {
    local git_dir="$1"
    if [ -f "$git_dir/index.lock" ] && [ ! -s "$git_dir/index.lock" ]; then
        rm -f "$git_dir/index.lock"
        echo -e "${YELLOW}Cleared stale empty index.lock at $git_dir/index.lock (see docs/development/git-worktree-locks.md)${NC}"
    fi
}
