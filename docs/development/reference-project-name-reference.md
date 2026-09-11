# Project Name Reference

[Back to Vitest Projects](reference-tests-vitest-projects.md#project-name-reference)

CI failure annotations start with the Vitest project in brackets. Translate that project directly
into the local command. For example:

```text
[backend-data-stores] backend/api/v1/memberships/refund.test.mts > suite > test
```

reproduces with:

```bash
pnpm exec vitest run --project backend-data-stores backend/api/v1/memberships/refund.test.mts
```

Aggregate scripts such as `test:backend`, `test:backend:default`, and `test:backend:core` select
additional projects and setup files. Use them for broader confidence only after running the exact
CI-named project; they are not substitutes for the isolation reproducer. For a one-off aggregate
selection, `pnpm run test:backend:default -- <file-a> <file-b> <file-c>` forwards all three filters
without passing the pnpm separator through to Vitest.

#### Large exact-file manifests

For a large one-off web selection, define the manifest once as a quoted shell array. Quoting
`"${files[@]}"` preserves each path as one argument, including spaces, parentheses, and bracketed
route segments. Do not replace the array with globs or command substitution, and do not insert a
literal `--` between Vitest's options and the paths. For syntax only, a path containing a space
would be written as `'web/path with spaces/example.test.tsx'`; put only existing test paths in the
runnable manifest.

Preflight the exact selection before running it. Pass `--project web` once, before the positional
path list, capture `vitest list --filesOnly` through `tee`, and abort unless its nonblank file count
matches the manifest count:

```bash
(
files=(
  'web/app/(fediverse)/fediverse/instances/page.mock.test.tsx'
  'web/app/(crawlers)/crawler/[id]/__tests__/layout.mock.test.tsx'
)

selected_file="$(mktemp "${TMPDIR:-/tmp}/voucha-vitest-selected.XXXXXX")" || exit 1
trap 'rm -f "$selected_file"' EXIT
set -o pipefail

if ! pnpm exec vitest list --project web --filesOnly "${files[@]}" | tee "$selected_file"; then
  printf 'Vitest preflight failed. Aborting.\n' >&2
  exit 1
fi

manifest_count=${#files[@]}
selected_count="$(awk 'NF { count++ } END { print count + 0 }' "$selected_file")"
if [ "$selected_count" -ne "$manifest_count" ]; then
  printf 'Vitest selected %s files; manifest contains %s. Aborting.\n' \
    "$selected_count" "$manifest_count" >&2
  exit 1
fi

pnpm exec vitest run --project web --bail=3 "${files[@]}"
)
```

For a manifest too large for one practical run, split it at coherent directory boundaries rather
than using an arbitrary fixed batch size. Preflight every batch independently and record both its
manifest and selected counts before running it.

A run is successful only when Vitest prints a passing summary **and the process exits with status
0**. If it prints a passing summary but remains alive, interrupt it, split or bisect the manifest,
preflight each smaller batch, and investigate the smallest reproducer with Vitest's
`--reporter=hanging-process` diagnostics.

Use `pnpm exec vitest run --project <name>` to run a single project directly. The complete
project-to-workflow ownership map is [`.github/workflows/VITEST.md`](../../.github/workflows/VITEST.md);
the table below highlights the projects most often used for local diagnosis.

| Project name                       | Test glob (`include`)                                                                                                                   | DB `globalSetup`? | Typical use                                       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------- |
| `backend-data-stores`              | `backend/{agents,api,data-stores,entrypoints,flows,md,queues,rss,scripts,services,sitemaps,tools,worker-runtime,workers}/**/*.test.mts` | **Yes**           | Backend API, services, data-store integration     |
| `backend-modules`                  | `backend/modules/**/*.test.mts`                                                                                                         | No                | Reusable backend utilities; no DB needed          |
| `backend/services/analytics`       | `backend/services/analytics/**/*.test.mts`, plus `backend/services/crawler-rss/index.redirect.test.mts`                                 | No                | Isolated local analytics contracts                |
| `backend-no-data-mocks`            | `backend/**/*.no-data.mock.test.mts`                                                                                                    | No                | Fully mocked tests with no service dependencies   |
| `backend-mocks`                    | `backend/{agents,api,modules,data-stores,...}/**/*.mock.test.mts`, excluding `*.no-data.mock.test.mts`                                  | **Yes**           | Mocked tests that still need backend services     |
| `backend-postgres-schema`          | `backend/data-stores/psql/__tests__/schema-static-analysis.test.mts`                                                                    | No                | Post-migration schema invariants                  |
| `backend-activitypub-capacity`     | ActivityPub inbox API and concurrent capacity contract tests                                                                            | **Yes**           | Serialized durable-inbox capacity enforcement     |
| `backend-aws`                      | `backend/**/*.s3.test.mts`, `backend/modules/aws/ses.generated.test.mts`                                                                | **Yes**           | Real S3/SES integration                           |
| `backend-openai`                   | `backend/**/*.openai*.test.mts`                                                                                                         | **Yes**           | Real OpenAI integration                           |
| `backend-bedrock`                  | `backend/**/*.bedrock.test.mts`                                                                                                         | No                | Real Bedrock integration (no DB needed)           |
| `lambdas-portability`              | Lambda development-server host behavior                                                                                                 | No                | Linux/macOS host portability                      |
| `cloudflare-worker-portability`    | Wrangler runtime path and filesystem behavior                                                                                           | No                | Linux/macOS host portability                      |
| `static-analysis-ast-grep`         | Ast-grep TSX and backend-contract parity tests                                                                                          | No                | Fast reusable ast-grep authoring preflight        |
| `web-storybook-component-coverage` | `web/storybook/__tests__/component-story-coverage.test.ts`                                                                              | No                | Fast component-to-story ownership preflight       |
| `web`                              | `web/**/*.test.{ts,tsx}`                                                                                                                | No                | Next.js components, hooks, server-actions (jsdom) |
| `web-api`                          | `integration-tests/web-api/**/*.test.mts`                                                                                               | **Yes**           | Next.js route handler integration                 |
| `web-integration`                  | `integration-tests/web/tests/**/*.test.mts`                                                                                             | **Yes**           | Full-stack web integration                        |
| `cloudflare-worker`                | `cloudflare-worker/**/*.test.mts`                                                                                                       | No                | Worker unit tests                                 |
| `cloudflare-worker-mocks`          | `cloudflare-worker/**/*.mock.test.mts`                                                                                                  | No                | Worker mock tests                                 |
| `dev-tools`                        | `dev/**/*.test.mts`                                                                                                                     | No                | Local setup and developer tooling self-tests      |
| `git-hooks`                        | `.husky/**/*.test.mts`                                                                                                                  | No                | Git hook transport and lifecycle checks           |
| `github-actions`                   | `.github/{actions,workflows}/**/*.test.mts`                                                                                             | No                | CI workflow static checks                         |
| `ci-tools`                         | `ci/**/*.test.mts` plus root `test-helpers/*.test.mts` files                                                                            | No                | CI tooling self-tests                             |

`backend-modules` does **not** use a DB `globalSetup` — new utilities under `backend/modules/` should not need database access. If your module needs DB, it belongs in `backend/data-stores/` or `backend/services/` and its tests in `backend-data-stores`.
