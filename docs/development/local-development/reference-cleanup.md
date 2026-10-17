# Cleanup

[Back to Dev Environment Reference](README.md#cleanup)

When worktrees are removed without `./dev/teardown`, orphaned databases and Valkey containers may
remain. `./dev/cleanup` (supports `--yes`) finds and removes them along with prunable worktrees, and
`./dev/status` warns about them. After moving a checkout, re-run `./dev/initialize web` first so
`.env` names the new resources. Cleanup removes only unreferenced resources in the canonical hashed
namespace and never offers legacy-named resources for automatic deletion, because another ordinary
clone may still reference them.

Cleanup fails closed before deleting anything when it cannot derive the identity of a live resource
owner. It also takes the host-wide worktree-resource operation lock and rescans ownership before
removing anything; non-main web initialization holds the same lock until `.env` publishes the new
names, so cleanup cannot delete resources another checkout is initializing. If a command reports an
active operation, let it finish and rerun. If a killed process left the lock stale, run
`./dev/unstick-locks` only after confirming nothing is still running
([git-worktree-locks.md](../git-worktree-locks.md)).

Initialization records every non-main worktree in the host-wide `~/.voucha/worktree-resource-owners`
registry, and disposable full clones in `~/.voucha/disposable-checkouts`. A worktree owned by another
clone therefore protects its resources without making a future protected main checkout at the same
path disposable.

`./dev/reset` recreates the DB, flushes Valkey, and re-migrates; `./dev/teardown` removes services,
DB, and Valkey. Both, plus `./dev/reset-worktree` and `db:clean`, **refuse to run on the main
worktree** (which owns the shared `voucha` DB and `voucha-valkey` container); set `FORCE_MAIN_RESET=1`
for that one command to override and never export it globally. Full clones under `.grok/worktrees`
or the temp directory are disposable and get worktree-owned databases.

`./dev/reset-worktree` (`--force` discards uncommitted changes) prepares a worktree for the next
agent task: it tears down services only when `.env` proves they belong to this worktree, fetches
`origin/main`, creates a fresh `reset-*` branch hard-reset to it, removes worktree-local generated
output while preserving dependencies, ports, certificates, and Playwright auth, then runs
`./dev/initialize monorepo`. Native-client cleanup belongs to
[vouchington-clients](https://github.com/vouchington/vouchington-clients).
