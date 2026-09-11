# Cleanup

[Back to Dev Environment Reference](README.md#cleanup)

When worktrees are removed without `./dev/teardown`, orphaned databases and Valkey containers may remain. Run `./dev/cleanup` (supports `--yes`) to find and remove them, along with prunable git worktrees. `./dev/status` will also warn about them.

The same cleanup boundary applies when a non-main worktree changes from a directory-name resource
identity to its canonical-path hash, or when its checkout path moves. Re-run `./dev/initialize web`
first so `.env` names the new resources. Cleanup automatically removes only unreferenced resources
in the canonical hashed namespace. It retains legacy-named databases and containers because
another ordinary clone may still reference them without being discoverable; remove those
explicitly only after verifying all of their users have migrated.
Cleanup never offers legacy-named resources for automatic deletion.

Cleanup fails closed before deleting any database or container when it cannot derive the identity
of a discovered live resource owner. Fix the identity-generation error and rerun cleanup; the
command does not continue to container or prunable-worktree cleanup after that safety failure.
After deletion is confirmed, cleanup acquires the host-wide worktree-resource operation lock and
rescans ownership before removing anything. Non-main web initialization holds the same lock from
resource creation until `.env` publishes the new names, so cleanup cannot delete a database or
Valkey container that another checkout is concurrently initializing. If either command reports an
active operation, let that operation finish and rerun the blocked command.
If a killed process leaves this lock stale, run `./dev/unstick-locks` only after confirming no
initialization or cleanup is still running; normal resource commands never break another owner's
lock automatically.

Initialization records every non-main worktree in the host-wide
`~/.voucha/worktree-resource-owners` registry. Status and cleanup combine that registry, the
standalone full-clone classification registry at `~/.voucha/disposable-checkouts`, and the current
clone's Git worktree list. A registered worktree owned by another ordinary clone therefore protects
its current hashed resources without making a future protected main checkout at the same path
disposable.

`./dev/reset` drops and recreates the DB, flushes Valkey, then re-migrates, keeping dependencies intact — preferred over `pnpm run db:clean` for full resets in disposable worktrees. Requires web init.

`./dev/teardown` (supports `--yes` and `--remove`) stops services, removes the Valkey container, drops the DB, and optionally removes the worktree directory. Requires web init.

`./dev/reset`, `./dev/reset-worktree`, `source .env && pnpm run db:clean`, and `./dev/teardown` all **refuse to run on the main worktree** (which owns the shared `voucha` DB and `voucha-valkey` container) — set `FORCE_MAIN_RESET=1` for that one command to override; never export it globally. Full clones under `.grok/worktrees` or `${TMPDIR:-${TMP:-${TEMP:-/tmp}}}` are disposable and do not need the override; `./dev/initialize web` assigns them worktree-owned databases instead of `voucha`, replaces an inherited shared `voucha` URL, and registers the checkout. Registration keeps the clone disposable after `TMPDIR` changes, and lets `./dev/cleanup` match derived database and Valkey names only until `.env` exists. `./dev/reset` and `./dev/db-clean` require `WORKTREE_DIR` to match the current checkout. Disposable initialize keeps its derived database and Valkey names after sourcing `~/voucha.env`. Registry lines that are missing or not a Voucha tree are ignored without rewriting the file. Status and cleanup deduplicate live paths.

To prepare a worktree for reuse by the next agent task (without removing the directory), use `./dev/reset-worktree` (`--force` discards uncommitted changes). It tears down services, DB, and Valkey only when `.env` and tracking files prove those resources belong to the current worktree. If the worktree was never web-initialized, or `.env` belongs to another worktree, reset skips teardown with a warning, then fetches `origin/main`, creates a fresh `reset-*` branch, and hard-resets it to `origin/main`.

After the hard reset, the command removes only worktree-local generated output: Next.js, Wrangler, Storybook, email-template, Lambda, and SOCI builds; coverage and test reports; and disposable tool caches. It preserves dependencies, `.env` port values, certificates, Playwright auth, and host-level package or Docker resources. It then runs `./dev/initialize monorepo` so `pnpm exec` tooling works immediately, clears the tmux pane title, and restores automatic tmux window naming. Run `./dev/initialize web` afterwards only when the next task needs the full stack. Native-client cleanup belongs to [vouchington-clients](https://github.com/vouchington/vouchington-clients).

`./dev/unstick-locks` sweeps all worktrees under `.git/worktrees/*/`, removes 0-byte `index.lock` files left by an interrupted `git maintenance run` (never a non-empty lock), and removes a worktree-resource operation lock only when its owner PID is gone. Run when no Git or worktree-resource operation is in flight. See [../docs/development/git-worktree-locks.md](../docs/development/git-worktree-locks.md).
