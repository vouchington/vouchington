#!/usr/bin/env bash
# Fail-closed, per-worktree advisory lock for ./dev/reset-worktree.
#
# One symlink at $REPO_ROOT/.local/reset-worktree.lock whose target encodes the
# owning PID: owner.<pid>.<rand>. `ln -s` is the atomic test-and-set -- the same
# primitive as the host-wide operation lock in worktree-resource-env.sh. Unlike
# that lock, this one never blocks, never reclaims a lock whose owner is still
# alive, and is scoped to one physical worktree: the caller already computes
# REPO_ROOT via `pwd -P`, so that canonical path *is* the key -- no digest, no
# registry, and two symlinked paths into the same physical worktree land on the
# same lock.
#
# RESET_WORKTREE_LOCK_TOKEN is a plain (never exported) assignment so a child
# process cannot release its parent's lock.

reset_worktree_lock_path() {
    printf '%s/.local/reset-worktree.lock' "$1"
}

# Parses an owner.<pid>.<rand> token and prints <pid>. Returns 1 on anything
# else: empty, missing, or malformed (e.g. "owner.123", "owner..1", garbage).
reset_worktree_lock_owner_pid() {
    local token=${1:-}
    if [[ "$token" =~ ^owner\.([0-9]+)\.[0-9]+$ ]]; then
        printf '%s' "${BASH_REMATCH[1]}"
        return 0
    fi
    return 1
}

# Acquires the lock for worktree root $1. On success, sets
# RESET_WORKTREE_LOCK_TOKEN and returns 0. On failure, prints the worktree,
# lock path, owning PID (or "unreadable" for a malformed target), and the
# recovery command, then returns 1. Never blocks and never removes an existing
# lock, live or malformed -- a spurious refusal costs one ./dev/unstick-locks
# round trip; a wrong removal costs two concurrent resets.
reset_worktree_lock_acquire() {
    local repo_root=$1
    local lock_path token held_token held_pid

    lock_path=$(reset_worktree_lock_path "$repo_root")
    if ! mkdir -p "$repo_root/.local" 2>/dev/null; then
        echo "Error: failed to create $repo_root/.local for the reset-worktree lock." >&2
        return 1
    fi

    token="owner.$$.$RANDOM$RANDOM"
    if ln -s "$token" "$lock_path" 2>/dev/null; then
        if [ "$(readlink "$lock_path" 2>/dev/null || true)" = "$token" ]; then
            RESET_WORKTREE_LOCK_TOKEN=$token
            return 0
        fi
        # lock_path was a symlink to a directory: `ln -s` silently placed our
        # token *inside* it instead of replacing lock_path, and still exited 0
        # -- the same hazard the sibling operation lock in worktree-resource-env.sh
        # guards against. We never actually acquired the canonical lock; discard
        # the stray entry we just created and fall through to report failure.
        rm -f "$lock_path/$token" 2>/dev/null || true
    fi

    held_token=$(readlink "$lock_path" 2>/dev/null || true)
    held_pid=$(reset_worktree_lock_owner_pid "$held_token") || held_pid=unreadable

    echo "Error: another ./dev/reset-worktree is already running for $repo_root" >&2
    echo "  Lock: $lock_path" >&2
    echo "  Owner PID: $held_pid" >&2
    echo "  If no reset is actually running, run ./dev/unstick-locks." >&2
    return 1
}

# Releases the lock for worktree root $1 if this process holds it. No-op
# without a token. Clears the token before removing the symlink so a repeated
# call (trap plus an explicit call) is idempotent, and never removes a lock
# whose target no longer matches our token (guards against releasing a lock
# some other process has since acquired).
reset_worktree_lock_release() {
    local repo_root=$1
    local token=${RESET_WORKTREE_LOCK_TOKEN:-}
    local lock_path

    [ -n "$token" ] || return 0
    lock_path=$(reset_worktree_lock_path "$repo_root")
    unset RESET_WORKTREE_LOCK_TOKEN
    if [ "$(readlink "$lock_path" 2>/dev/null || true)" = "$token" ]; then
        rm -f "$lock_path"
    fi
}

# Clears a stale (dead-owner) reset-worktree lock for worktree root $1.
# Exports RESET_WORKTREE_LOCK_CLEANUP_STATUS to one of:
#   missing - no lock present (returns 0)
#   removed - a dead owner's lock was removed (returns 0)
#   active  - the owner process is still alive; not removed (returns 1)
#   invalid - the lock target exists but isn't a symlink, or isn't a valid
#             owner.<pid>.<rand> token; not removed (returns 1)
# A malformed or non-symlink entry is deliberately never auto-removed: report
# and let a human confirm and delete it by hand.
#
# The active/invalid outcomes never touch the filesystem, so a lock this
# function decides not to remove is left completely untouched -- no window
# where a concurrent acquire could observe it missing. Only a confirmed-dead
# owner reaches the mutating path, and that path claims the *current*
# occupant of lock_path via `mv` (a single rename syscall) before deciding
# anything, rather than trusting a plain readlink taken earlier: two
# concurrent callers (e.g. two ./dev/unstick-locks runs) can both read the
# same dead token, and by the time the second one acts, the first may have
# already removed it and a retried reset-worktree may have acquired a fresh
# live lock in its place. Re-deriving liveness from whatever the `mv` actually
# claimed -- not from the stale token read before it -- means a caller only
# ever finalizes a removal for content it can currently prove is dead, and
# restores anything else (live or malformed) it accidentally claimed.
reset_worktree_lock_clear_stale() {
    local repo_root=$1
    local lock_path claim_path held_token held_pid claimed_token claimed_pid

    lock_path=$(reset_worktree_lock_path "$repo_root")
    export RESET_WORKTREE_LOCK_CLEANUP_STATUS=missing

    if [ ! -L "$lock_path" ]; then
        if [ -e "$lock_path" ]; then
            # A regular file or directory here blocks `ln -s` the same way a
            # live lock would, but reporting it as "missing" tells a human
            # running ./dev/unstick-locks that there is nothing to fix.
            export RESET_WORKTREE_LOCK_CLEANUP_STATUS=invalid
            return 1
        fi
        return 0
    fi

    held_token=$(readlink "$lock_path")
    if ! held_pid=$(reset_worktree_lock_owner_pid "$held_token"); then
        export RESET_WORKTREE_LOCK_CLEANUP_STATUS=invalid
        return 1
    fi
    if kill -0 "$held_pid" 2>/dev/null; then
        export RESET_WORKTREE_LOCK_CLEANUP_STATUS=active
        return 1
    fi

    # Dead owner confirmed. Atomically claim whatever currently occupies
    # lock_path -- the first filesystem mutation in this function.
    claim_path="$lock_path.claim.$$"
    if ! mv "$lock_path" "$claim_path" 2>/dev/null; then
        # Already gone: another caller's claim (or the owner's own release)
        # beat us to it. The dead lock we set out to clear is gone either way.
        export RESET_WORKTREE_LOCK_CLEANUP_STATUS=removed
        return 0
    fi

    claimed_token=$(readlink "$claim_path" 2>/dev/null || true)
    if ! claimed_pid=$(reset_worktree_lock_owner_pid "$claimed_token"); then
        # Claimed something malformed -- never seen if we claimed our own
        # held_token, so this means another caller's acquire or cleanup raced
        # in first. Put it back untouched and let a human sort it out.
        mv -n "$claim_path" "$lock_path" 2>/dev/null || rm -f "$claim_path"
        export RESET_WORKTREE_LOCK_CLEANUP_STATUS=invalid
        return 1
    fi
    if kill -0 "$claimed_pid" 2>/dev/null; then
        # Claimed a live lock: a fresh reset-worktree acquired here between
        # our readlink above and this claim. Restore it -- `-n` leaves
        # claim_path in place (for us to discard) if lock_path has since been
        # recreated yet again, which is the one residual window this function
        # cannot close without its own serialization; same accepted-limitation
        # class as PID reuse, see docs/development/git-worktree-locks.md.
        mv -n "$claim_path" "$lock_path" 2>/dev/null || rm -f "$claim_path"
        export RESET_WORKTREE_LOCK_CLEANUP_STATUS=active
        return 1
    fi

    # Claimed content is a dead owner -- the one we originally saw, or a
    # different one that also died in the interim. Either way, safe to finalize.
    rm -f "$claim_path"
    export RESET_WORKTREE_LOCK_CLEANUP_STATUS=removed
}
