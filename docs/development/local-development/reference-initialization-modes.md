# Initialization Modes

[Back to Dev Environment Reference](README.md#initialization-modes)

- **`./dev/initialize monorepo`** installs dependencies and pinned CI tools; no Docker or DB. Use for
  lint, static-analysis rules, and unit tests.
- **`./dev/initialize backend`** adds ports, the Valkey container, DB, migrations, and `.env`; no HTTPS
  certs, CF Worker env, or web-only secrets.
- **`./dev/initialize web`** (default) is the full setup, enabling `./dev/tmux`. It clears the
  Miniflare and Next.js runtime caches ([Miniflare Cache](reference-miniflare-cache.md)) and is safe
  to re-run to repair a worktree without reallocating its saved resources.

Non-main worktree resource identities hash the canonical physical checkout root. Moving a checkout
makes the saved environment stale: initialization allocates fresh ports, database, and Valkey
resources and rewrites `.env` without copying data or deleting the superseded resources; cleanup
removes orphaned canonical hashed resources but retains legacy-named ones for explicitly verified
removal.

All modes resolve and import native addons from their real consumer workspaces before writing
`.initialized`. On failure the initializer prints each failed package and a
`pnpm install --frozen-lockfile --force` repair command; it never repairs automatically. All modes
also require free space on each filesystem backing the worktree, home, and temp directories, and the
preflight never deletes anything.

The `.initialized` marker records the strongest completed capability on the ladder
`monorepo` < `backend` < `web`, not the most recently requested mode:
`marker = max(requested, min(existing_marker, strongest_valid_on_disk))`. The strongest valid mode is
probed fresh on every run, so a stale marker demotes instead of being trusted, and a lower mode run
against a still-valid stronger worktree preserves the stronger capability.
`./dev/reset-worktree` is the intentional invalidation boundary.

If `createdb` or `psql` reports "no such file" or "connection refused", confirm the host PostgreSQL
service is running and retry with `source .env && ./dev/initialize web`. Correct `DATABASE_URL` in
`.env` rather than substituting `PGHOST`. For web validation recovery see
[Local Web Validation Recovery](../reference-tests-local-web-validation-recovery.md).
