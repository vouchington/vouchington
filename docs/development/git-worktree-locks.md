# Git Worktree Lock Collisions

## Symptom

Foreground git operations (`commit`, `rebase --continue`, `push`) fail with:

```
fatal: Unable to create '.git/worktrees/<name>/index.lock': File exists.
```

Worst case: a rebase finalizes its last commit but fails the final ref-update step, leaving
`.git/worktrees/<name>/rebase-merge/` on disk, so git thinks the rebase is still in progress.

**Recovery for a stale 0-byte lock** (the most common case, left by a killed maintenance run). Run
only when no other git operations are in flight, since git briefly holds a 0-byte lock during
creation:

```bash
./dev/unstick-locks    # removes stale Git locks and a dead-owner resource-operation lock
```

The same command clears the host-wide worktree-resource operation lock only when its recorded owner
PID is gone. Run it only after confirming no `./dev/initialize web` or `./dev/cleanup` process is
still active; those commands otherwise fail closed rather than automatically breaking a stale lock.

**Recovery for a stuck rebase:** if the lock failure happened at the final ref-update (all commits
already applied), `git rebase --quit` clears the rebase state and leaves the branch at its current
HEAD. If it fired mid-rebase, try `git rebase --continue` first. Do not use `--abort` (it rewinds all
applied commits) or `rm -rf .git/worktrees/<name>/rebase-merge/` (high blast radius).

## Root cause and fix

Two sources of stale `index.lock` files: the foreground `git maintenance run --auto --detach` that
fires after most foreground commands, and the scheduled `git maintenance run` that walks every
worktree and, if interrupted (sleep, shutdown, OOM), leaves a 0-byte lock behind. A 0-byte lock is
the signature of a killed writer, because git writes the new index into the lock before renaming it.
Parallel agent sessions multiply the collision rate.

One-time global config moves maintenance off the foreground path:

```bash
git config --global maintenance.auto false
git config --global gc.auto 0
git config --global fetch.writeCommitGraph false
git maintenance start   # per repo; registers it in the global maintenance.repo list
```

`./dev/initialize` self-heals 0-byte stale locks at the start and end of every run as a safety net.
Without any maintenance run, loose objects and the commit-graph go stale: slower, never incorrect.

## `extensions.worktreeConfig` and `core.bare` corruption

`git worktree add` sets `extensions.worktreeConfig = true` in the shared config. When the
per-worktree `config.worktree` file is missing, a later config write (the `push.autoSetupRemote`
branch-tracking write) lands `core.bare = true` in the shared config. Every git command then fails
with `fatal: this operation must be run in a work tree`.

A similar gap can write `core.worktree` into the shared config, redirecting every worktree to the
wrong directory: git commands report content matching `HEAD` while files read directly are stale,
and `git rev-parse --show-toplevel` from the main checkout returns a path under `.git/worktrees/`.

Recovery, from the main worktree root:

```bash
git config core.bare false
git config --unset extensions.worktreeConfig
git config --unset core.worktree
git reset --hard HEAD   # tracked files only; inspect untracked files before deleting them
```

`heal_shared_git_config` in [dev/initialize](../../dev/initialize) strips these on every run, so the
state self-heals the next time a worktree is initialized.

## `./dev/reset-worktree` concurrency guard

`Error: another ./dev/reset-worktree is running for this worktree.` means two concurrent resets in
one worktree would race (fetch, teardown, hard-reset, output removal). A kernel lock on
`.local/reset-worktree.lock` is held through the entire reset and released automatically when the
owner exits; the zero-byte file's existence alone does not mean a lock is held. Wait for the other
reset to finish and rerun. There is no stale reset lock to clear with `./dev/unstick-locks`.
