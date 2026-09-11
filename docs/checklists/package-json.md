# package.json Checklist

Use this checklist when adding a dependency, editing a workspace `package.json`, or creating a new backend service.

## Checklist

- **Use `pnpm`** — never `npm install` or `npm add`. Use `pnpm add`, `pnpm install`, `pnpm remove`.
- **Always use latest stable / LTS** when adding a new dependency. Check with `npm view <pkg> version` or `npm view <pkg> dist-tags`. Prefer LTS over latest when available.
- **Commit the lockfile** — every `package.json` change must include the matching `pnpm-lock.yaml` diff in the same commit.
- **Do not patch dependencies** — `.patch` and `.diff` files plus pnpm `patchedDependencies` and `allowUnusedPatches` are forbidden. Fix the underlying problem upstream, or file and link a Filaments issue labeled `dependencies`.
- **Run package policy** — after any `package.json` change, run `pnpm run syncpack:lint && pnpm run no-mistakes`; auto-fix Syncpack with `pnpm run syncpack:fix`. `no-mistakes` owns manifest field shape, validation dependencies, exact nested workspace coverage (`package-json-nested-workspace-coverage`), workspace-package cycles, registry-only dependencies, workspace membership, and the pnpm overrides ban.
- **`backend/package.json`'s local `workspaces` array** — kept in sync with the `backend/*` subset of root `pnpm-workspace.yaml` by the `backend/package.json workspaces match pnpm-workspace.yaml` `finite-set-consistency` rule in [`.no-mistakes.yml`](../../.no-mistakes.yml). That local array is read separately by `backend/Dockerfile`'s deploy stages; a missed entry passes install/lint/typecheck/test and only fails at image boot.
- **Stale `node_modules`** — if you see `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` or module-not-found errors after a rebase or branch switch, run bare `pnpm install` (no flags). Never use `--frozen-lockfile` as a workaround — it leaves `node_modules` behind the lockfile (issue #5269). `.husky/post-rewrite` automates this for rebase, `.husky/post-merge` for merge, and `.husky/post-checkout` for branch switches (issue #10009).
- **New top-level package** — add the new `package.json` to **all three** hand-maintained registries: `.syncpackrc.json` `source`, a matching group in [`.github/ci-path-filters.yml`](../../.github/ci-path-filters.yml), and (for a fixed-name path) `pnpm-workspace.yaml` `packages`. A new package under an existing wildcard glob (e.g. `backend/*`, `lambdas/*`) needs none of those edits, but every wildcard glob must still be reachable from the `tooling:` CI group or a new package there ships unpoliced. [`ci/workspace-package-registry-coverage.test.mts`](../../ci/workspace-package-registry-coverage.test.mts) asserts all of this from `git ls-files`; run it after adding a package.
- **New backend service** — add to **both** `backend/api/package.json` **and** `backend/entrypoints/api/package.json` (and any other entrypoints that need to reach the service). The `servicePackageChecker` in [dev/codex-hooks/post-tool-use-checkers.mts](../../dev/codex-hooks/post-tool-use-checkers.mts) warns on new `backend/services/*/package.json` files not yet tracked by `HEAD`. The entrypoint audit test enforces this in CI.
- **First-party packages** — ownership and upstream feedback rules live in [docs/development/first-party-dependencies.md](../development/first-party-dependencies.md). Keep that table and `pnpm-release-age-policy.permanentPackages` in [`.no-mistakes.yml`](../../.no-mistakes.yml) in sync whenever first-party package boundaries change.
- **Dependency automation** — Dependabot and Renovate keep npm, Docker, and GitHub Actions deps fresh automatically. See [docs/development/dependency-updates.md](../development/dependency-updates.md) for the coverage matrix, how to add a new pinned binary, and the [docs pinning policy](../development/dependency-updates.md#docs-pinning-policy): living docs name majors or minimums, not copied `x.y.z` pins.

## See Also

- [package-json-checklist skill](../../.agents/skills/package-json-checklist/SKILL.md) — skill entry point
- [backend/CLAUDE.md](../../backend/CLAUDE.md) — new service registration rules
- [docs/development/first-party-dependencies.md](../development/first-party-dependencies.md) — first-party package map
- [docs/development/dependency-updates.md](../development/dependency-updates.md) — Dependabot/Renovate coverage, pinning style, and docs pinning policy
- [CLAUDE.md](../../CLAUDE.md) — root instructions
