# Commands Reference

[Back to Workflow Authoring Reference](AUTHORING.md#commands-reference)

Canonical local-command list is in [docs/development/tests.md](../../docs/development/tests.md); CI workflow/config/coverage details are in [docs/development/ci.md](../../docs/development/ci.md). This table records the underlying invocations CI uses (package scripts expand to these).

Run commands directly when no repository policy wrapper applies. Compiler-heavy Next and Storybook
commands run the same way: invoke `next build`/`storybook build` directly rather than through a
package-script wrapper. Native-client commands are documented
in [vouchington-clients](https://github.com/vouchington/vouchington-clients). For other commands, package-script
indirection spawns an extra process, obscures the real command in logs and error messages, and
makes it harder to see what the workflow is doing at a glance.

Instead, use the underlying command. For package binaries (tools in `node_modules/.bin`), use `pnpm exec <cmd>` — this finds the locally installed binary without relying on package-script PATH injection. Examples:

| Instead of                              | Use                                                                                                                                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm run oxlint`                       | `pnpm exec oxlint --type-aware --deny-warnings`                                                                                                                   |
| `pnpm run oxfmt:check`                  | `pnpm exec oxfmt --check`                                                                                                                                         |
| `pnpm run selene`                       | `selene --config selene.toml backend/services/jwt-session/scripts`                                                                                                |
| `pnpm run typecheck:web`                | `working-directory: web`, then `pnpm exec next typegen && pnpm exec tsc --noEmit --incremental`                                                                   |
| `pnpm run typecheck:backend`            | `pnpm exec tsc --noEmit --incremental --project backend/tsconfig.json && pnpm exec tsc --noEmit --project email-templates/tsconfig.json`                          |
| `pnpm run typecheck:cloudflare-worker`  | `pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json`                                                                                                |
| `pnpm run typecheck:lambdas`            | `pnpm exec tsc --noEmit --project lambdas/tsconfig.json`                                                                                                          |
| `pnpm run db:migrate`                   | `working-directory: backend`, then `node data-stores/psql/migrate.mts`                                                                                            |
| `pnpm run test:backend:postgres-schema` | Run migrations first, then `pnpm exec ./ci/with-node-test-options vitest run --project backend-postgres-schema`                                                   |
| `pnpm run test:smoke:backend`           | `working-directory: backend`, then `./scripts/tests/smoke-test-server.sh && ./scripts/tests/smoke-test-worker.sh`                                                 |
| `pnpm run test:smoke:web`               | `working-directory: web`, then `./scripts/tests/smoke-test-web.sh`                                                                                                |
| `pnpm run syncpack:lint`                | `syncpack lint && syncpack format --check` — validates dependency version/range/specifier policy AND `package.json` key/dependency ordering across all workspaces |
| `pnpm run no-mistakes`                  | `no-mistakes check --tsconfig tsconfig.json` — validates package field shape, workspace declarations, dependency graph, and repository structure                  |
| `pnpm run jscpd`                        | `pnpm exec jscpd .` — reads [`.jscpd.json`](../../.jscpd.json)                                                                                                    |

For local reproduction, `./dev/ci-local --list` shows supported targets and
`./dev/ci-local <target> --dry-run` prints the commands it will run. The runner verifies its
registered command text against these workflow files before executing a target so copied local
commands do not silently drift.
