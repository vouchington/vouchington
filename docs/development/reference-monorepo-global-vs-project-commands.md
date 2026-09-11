# Global vs. Project Commands

[Back to Monorepo Map](MONOREPO.md#global-vs-project-commands)

Global commands belong in the repo-root `package.json`. Project commands belong in each workspace's `package.json`. Proxy project-specific commands to the root via the `:<workspace>` suffix when possible:

```bash
pnpm run typecheck:backend
# equivalent to
cd backend && pnpm run typecheck
# equivalent to
pnpm --dir backend typecheck
```

Root scripts that fan out to workspaces should run all relevant projects in sequence:

```bash
pnpm run typecheck
# equivalent to
pnpm --dir backend typecheck && pnpm --dir web typecheck && \
  tsc --noEmit --incremental --project lambdas/tsconfig.json && \
  pnpm --dir cloudflare-worker typecheck
```

With pnpm, command orchestration and dependency ownership are separate. Root scripts may run
workspace test/typecheck projects, but a workspace that owns package-level validation must
declare the tools that validation resolves. For example, `email-templates` test files import
`vitest`; `web` owns the jsdom runtime used by its Vitest project, while root-owned Storybook
Vitest projects continue to resolve the Vitest runner from the root; and package-local
`typecheck` scripts that invoke stable TypeScript 7's `tsc` require `@typescript/native` in that
package's `devDependencies`. Workspaces that consume the TypeScript programmatic API use the
`typescript` alias for `@typescript/typescript6`, keeping TypeScript 6 available without replacing
the native compiler binary.

The pnpm workspace dependency graph is the single source of truth for which package depends on
which: each backend package's `package.json` declares exactly the workspace/npm dependencies its
source imports, and `knip` plus per-workspace `tsc --noEmit` typechecking enforce that declared
dependencies stay resolvable and used. There is no separate reconciliation script — a package that
imports something it hasn't declared fails typecheck (NodeNext module resolution) or gets flagged
by `knip` as an unlisted dependency.
[`@voucha/backend`](../../backend/package.json) is the workspace root/hub package; it has shrunk to
only the dependencies [`backend/dev.mts`](../../backend/dev.mts) itself needs
(`@data-stores/graceful-shutdown`, `@voucha/api`, `http-terminator`) rather than aggregating every
backend package's runtime dependencies. Per-entrypoint deploy closures and cross-entrypoint
heavy-module isolation (e.g. keeping `sharp`/`@jongleberry/vurst-ai` and
`worker-cpu`-only code out of the lightweight `api`/`worker-io` entrypoints) are enforced by the
`forbidden-dependencies` and `forbidden-workspace-closure` rules in
[`.no-mistakes.yml`](../../.no-mistakes.yml). The same closure guard keeps the development-only
`agent-blackboard` integration out of every production entrypoint; reproduce locally with
`pnpm run no-mistakes`.
Local CI command reproduction lives behind [`./dev/ci-local`](../../dev/ci-local); use `--dry-run`
to print workflow-equivalent commands without running them.

For the full list of checks see [development/tests.md](tests.md) (local commands) and [development/ci.md](ci.md) (CI workflows).
