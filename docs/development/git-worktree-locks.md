# Git Worktree Lock Collisions

## Symptom

Foreground git operations (`commit`, `rebase --continue`, `push`) fail with:

```
fatal: Unable to create '.git/worktrees/<name>/index.lock': File exists.
```

Worst case: a rebase finalizes its last commit but fails the final ref-update step, leaving `.git/worktrees/<name>/rebase-merge/` on disk. Subsequent commands then refuse to run because git thinks the rebase is still in progress.

**Recovery for a stale 0-byte lock** (the most common case — left by a killed maintenance run). Run only when no other git operations are in flight, since git briefly holds a 0-byte lock during creation before writing index content:

```bash
./dev/unstick-locks    # removes stale Git locks, a dead-owner resource-operation lock, and a
                       # dead-owner ./dev/reset-worktree lock
```

Or to clear a specific worktree's lock manually:

```bash
# Only removes the lock if it is 0 bytes; never removes a non-empty lock
[ -s .git/worktrees/<name>/index.lock ] || rm -f .git/worktrees/<name>/index.lock
```

The same command clears the host-wide worktree-resource operation lock only when its recorded owner
PID is gone. Run it only after confirming no `./dev/initialize web` or `./dev/cleanup` process is
still active; those commands otherwise fail closed rather than automatically breaking a stale lock.

**Recovery for a stuck rebase:** If the lock failure happened at the final ref-update (all commits already applied), `git rebase --quit` clears the rebase state and leaves the branch at its current HEAD. If the lock fired mid-rebase, try `git rebase --continue` first. Do not use `--abort` (it rewinds all applied commits) or `rm -rf .git/worktrees/<name>/rebase-merge/` (high blast radius).

## Root Cause

There are two sources of stale `index.lock` files:

**1. Foreground `git maintenance run --auto --detach`** fires in the background after most foreground commands. It grabs `.git/worktrees/<name>/index.lock`; if the foreground command needs that lock at the same moment, the foreground command fails.

**2. Scheduled `git maintenance run`** (installed by `git maintenance start`) runs OS-level jobs on a cron-like schedule (hourly on macOS via `~/Library/LaunchAgents/org.git-scm.git.hourly.plist`). The job iterates every registered repo and walks every worktree under `.git/worktrees/*` sequentially. If the job is interrupted — laptop sleep, shutdown, signal, OOM — it leaves a 0-byte `index.lock` in whichever worktree it was processing when killed. The next foreground git command in that worktree then fails. With many worktrees the sweep takes longer, raising the chance of an interrupted iteration.

The 0-byte lock is the unambiguous signature of a killed process: git writes the new index content into the lock file before atomically renaming it over `index`, so a 0-byte lock means the writer was killed before writing anything.

Multiple worktrees compound both sources: each has its own `index.lock`, and parallel Claude Code sessions multiply the collision rate roughly linearly.

## Fix

Disable auto-maintenance globally and run maintenance on a schedule instead:

```bash
git config --global maintenance.auto false
git config --global gc.auto 0
git config --global fetch.writeCommitGraph false
git maintenance start   # installs OS-level scheduled jobs (see below)
```

`git maintenance start` installs OS-level scheduled jobs that run maintenance off the foreground path:

- **macOS** — launchd user agents in `~/Library/LaunchAgents/` (hourly, daily, weekly); verify with `launchctl list | grep git`
- **Linux** — systemd user timers in `~/.config/systemd/user/`; verify with `systemctl --user list-timers | grep git`

Collision risk from source 1 drops from "several times per rebase" to "rare." Source 2 (interrupted scheduled maintenance) is the residual risk; `./dev/initialize` self-heals 0-byte stale locks at the start and end of every run as a safety net.

**Scope:** `git maintenance start` only registers the repo you run it in (stored in your global git config under `maintenance.repo`). The timers run `git for-each-repo --config=maintenance.repo ...`, so repos not in the list are skipped. Run it once per repo, or add paths manually:

```bash
git config --global --get-all maintenance.repo          # see what's registered
git config --global --add maintenance.repo /path/to/repo  # add another repo
```

To stop scheduled maintenance: `git maintenance stop`.

## Tradeoffs

Without any `maintenance run` (scheduled or manual), over time:

- Loose objects accumulate in `.git/objects/` — disk bloat, slower object walks.
- No commit-graph refresh — `git log`, `git blame`, and merge-base get slower.
- Refs stay loose — minor unless you create many branches.

None are correctness issues; `git maintenance start` mitigates all of them. Alternatively, run `git maintenance run` manually on any cadence you prefer.

`./dev/initialize` clears stale 0-byte locks automatically, so the practical impact of interrupted scheduled maintenance is limited to the window between an interruption and the next `./dev/initialize` run.

## `extensions.worktreeConfig` and `core.bare` corruption

### Symptom

Any git command fails with:

```
fatal: this operation must be run in a work tree
```

Or `git config core.bare` returns `true` even though the repo is not bare.

### Root Cause

`git worktree add` (git ≥ 2.36) automatically sets `extensions.worktreeConfig = true`
in the shared `.git/config`. When enabled, git expects a per-worktree
`.git/config.worktree` file to hold `core.bare` and `core.worktree`. If that file
is missing, git's config-write code (triggered during `git push` — specifically the
`push.autoSetupRemote` branch-tracking write) writes `core.bare = true` into the shared `.git/config`,
treating the shared git directory as bare. Every subsequent git command then sees a
bare repo and refuses to work.

The 0-byte `config.worktree` is never created in this repo because the first
`git worktree add` that set `extensions.worktreeConfig` ran when the setting may
have already been present, skipping the migration that would have created the file.

### Recovery

```bash
# Run from the main worktree root:
git config core.bare false                        # restore the working-tree flag
git config --unset extensions.worktreeConfig      # remove the broken setting
```

### Prevention

`./dev/initialize` removes `extensions.worktreeConfig` on every run, so the broken
state self-heals the next time a worktree is initialized. If you see the symptom
before running `./dev/initialize`, apply the recovery commands above.

## `core.worktree` pointing at a linked worktree

### Symptom

Every git command run from the main checkout (`status`, `diff`, `show`, `log`) reports
content that matches `HEAD`/origin — but files read directly (`cat`, `grep`, editor
tools) show stale content, even though `git status` claims the tree is clean.

`git rev-parse --show-toplevel` from the main checkout returns a path under
`.git/worktrees/<name>/` (or another linked worktree's directory) instead of the
main checkout's own path.

### Root Cause

Same underlying gap as the `core.bare` corruption above: `extensions.worktreeConfig`
was enabled by a `git worktree add` without ever creating the per-worktree
`config.worktree` file for every worktree in the repo. When something later performs
a worktree-scoped `core.worktree` write (for example, tooling that creates a linked
worktree and configures it as the working tree for the shared `.git` dir) with no
`config.worktree` file to scope it to, the write lands in the **shared** `.git/config`
instead — silently redirecting every worktree that reads that shared config to the
wrong physical directory.

### Recovery

```bash
# Run from the main worktree root:
git config --unset core.worktree
git reset --hard HEAD   # tracked files only; untracked files are left alone
```

Inspect any untracked files left behind before deleting them — they may be
uncommitted work stranded when the corruption first occurred, not just build output.

### Prevention

`heal_shared_git_config` in [dev/initialize](../../dev/initialize) strips a stray
`core.worktree` from the shared config on every init, the same way it already resets
`core.bare` and `extensions.worktreeConfig`.

## `./dev/reset-worktree` concurrency lock

### Symptom

```
Error: another ./dev/reset-worktree is already running for <worktree>
  Lock: <worktree>/.local/reset-worktree.lock
  Owner PID: <pid>
  If no reset is actually running, run ./dev/unstick-locks.
```

### Root Cause

Two concurrent `./dev/reset-worktree` runs in the same worktree race: both tear down
services, fetch and hard-reset the branch, and remove generated output, so a second
run started mid-reset can observe (or clobber) a half-completed reset ([#10849](https://github.com/jonathanong/filaments/issues/10849)).
`./dev/reset-worktree` now takes a fail-closed, non-blocking, per-worktree advisory
lock at `.local/reset-worktree.lock` (a symlink encoding the owning PID) before doing
anything destructive, and holds it for the whole run via an EXIT/INT/TERM trap. A
second run finds the symlink already present, refuses immediately, and never touches
the first run's lock or resources.

Unlike `index.lock`, this lock is never 0 bytes — the owner's liveness is checked
directly (`kill -0 <pid>`) rather than inferred from file size.

### Recovery

```bash
./dev/unstick-locks   # removes the lock only if its owner PID is no longer alive
```

If the owner is still alive, the reset really is still running — wait for it, or
inspect PID `<pid>` before doing anything more forceful.

## See Also

- [dev/CLAUDE.md](../../dev/CLAUDE.md) — worktree setup and initialization; `./dev/unstick-locks` command
- GitHub issue [#2290](https://github.com/jonathanong/filaments/issues/2290) — original diagnosis
