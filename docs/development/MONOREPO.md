# Monorepo Map

The Voucha repo is a multi-package monorepo. The root `package.json` provides repo-wide scripts,
while runtime packages keep their own `package.json` in the directory that owns the code. Each
package's boundaries live in its nearest `AGENTS.md`, starting from [AGENTS.md](../../AGENTS.md).

- Workspace package dependencies must stay acyclic: `pnpm-workspace.yaml` sets
  `disallowWorkspaceCycles: true`, so `pnpm install` fails when manifests introduce a cycle even if
  TypeScript imports would compile.
- Global commands belong in the root `package.json`; project commands belong in each workspace and
  are proxied from the root with a `:<workspace>` suffix (`pnpm run typecheck:backend`).
- Orchestration and dependency ownership are separate: a workspace that owns package-level
  validation must declare the tools that validation resolves, even when a root script runs it.
- The pnpm workspace graph is the single source of truth for dependencies. `knip` and per-workspace
  typechecking enforce that declared dependencies stay resolvable and used. Per-entrypoint deploy
  closures and heavy-module isolation are enforced by the `forbidden-dependencies` and
  `forbidden-workspace-closure` rules in [`.no-mistakes.yml`](../../.no-mistakes.yml).
- Local commands: [tests.md](tests.md). CI: [ci.md](ci.md).
