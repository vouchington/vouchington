# Code Statistics Policy

`pnpm run cloc` produces a code-line count table grouped by service and split
into `source`, `tests`, and `tooling` categories. This document records the
policy so the rules are explicit and reviewable alongside the implementation in
`dev/cloc/`.

## Counted roots

The report is **allowlist-gated**: only paths under the roots and files listed in
`dev/cloc/paths.mts` are fed to `scc`. Scanning `.` and post-filtering would risk
counting build output, dependency trees, or off-repo sub-modules. The two
allowlists are:

- **`countedRoots`** — directory prefixes (e.g. `backend`, `web`,
  `cloudflare-worker`, `playwright`, `integration-tests`, `ci`, `dev`, `docs`,
  `monitors`, …). Any file whose path starts with `<root>/` is eligible.
- **`countedRootFiles`** — individual root-level files (e.g. `package.json`,
  `README.md`, `vitest.config.mts`, `renovate.json`, `.jscpd.json`, …). Root
  dot-config JSON is classified as `tooling` (see below).

`scc` is invoked with the explicit list of matching roots/files rather than `.`.
Off-allowlist roots (e.g. `articles/`) are never passed to `scc`, even when they
contain tracked files.

## Excluded paths

Two exclusion layers apply:

1. **`excludedDirs`** (passed as `scc --exclude-dir`) — build and dependency
   output that `scc` must never descend into: `.git`, `.next`, `.turbo`,
   `.wrangler`, `build`, `coverage`, `dist`, `node_modules`, `out`, and VCS
   metadata directories (`.hg`, `.svn`).

2. **Fixture and snapshot exclusion** (applied after scc output is parsed) —
   paths containing `/fixtures/`, `/__fixtures__/`, or `/__snapshots__/`, and
   paths starting with `fixtures/`, `__fixtures__/`, or `__snapshots__/`, are
   excluded from counting. These sub-trees hold test data whose line count is
   noise (auto-generated HTML snapshots, seed JSON, etc.).

Only files that pass **both** layers and are currently tracked by `git ls-files`
are counted.

## Service mapping

The service is determined by the leading path segment:

| Leading path prefix                         | Service             |
| ------------------------------------------- | ------------------- |
| `backend/`                                  | `backend`           |
| `web/`                                      | `web`               |
| `integration-tests/`                        | `web`               |
| `playwright/`                               | `web`               |
| `cloudflare-worker/`                        | `cloudflare-worker` |
| `lambdas/`                                  | `lambdas`           |
| `email-templates/`                          | `email-templates`   |
| `ts-shared/`                                | `ts-shared`         |
| `docs/`, root `README.md`, root `CLAUDE.md` | `docs`              |
| `monitors/`                                 | `infra`             |
| everything else                             | `tooling`           |

`integration-tests/` and `playwright/` map to `web` because they are web-stack
integration and end-to-end tests.

## Category rules

Categories are assigned in precedence order: **tests** > **tooling** > **source**.

### tests

A path is classified as `tests` when any of the following match:

- Basename matches `*.test.[cm]?[jt]sx?`, `*.spec.[cm]?[jt]sx?`, or
  `*.mock.test.[cm]?[jt]sx?`
- Path contains `/__tests__/`, `/__snapshots__/`, `/tests/`, or `/test/`
- Path starts with `playwright/` (all Playwright files — helpers included)
- Path starts with `integration-tests/`

The `playwright/helpers/` sub-tree is `tests`, not `tooling`, even though helper
files are not specs. All Playwright files are considered part of the test suite.

### tooling

A path is classified as `tooling` (when not already `tests`) when it matches any
of:

- Starts with `.github/`, `.husky/`, `.agents/`, `.codex/`, `ast-grep-rules/`,
  `ci/`, `dev/`, `monitors/`, `seed/`,
  `static-code-analysis/`, `docs/`
- Contains `/test-helpers/` (shared helpers used across test suites — not counted
  as tests themselves)
- Starts with `backend/scripts/` or `web/scripts/`
- Basename is `CLAUDE.md`, `README.md`, `package.json`, or `tsconfig.json`
  (applies at any depth)
- Basename starts with `.` and ends with `.json` (dot-config JSON such as
  `.oxlintrc.json`)
- Basename is `components.json` or `renovate.json`
- Root-level config: `commitlint.config.mts`, `pnpm-workspace.yaml`,
  `selene.toml`, `vitest.config.mts`
- Extension is `.config.mts`, `.config.ts`, `.config.js`, `.jsonc`, `.toml`,
  `.yml`, or `.yaml`

**Important edge cases:**

- `api-fixtures/v1/client-intents.json` is `source` (runtime fixture data, not a
  config basename).
- `cloudflare-worker/test-helpers/src/cache.mts` is `tooling` (matched by
  `/test-helpers/`), not `tests`.
- `backend/agents/.oxlintrc.json` is `tooling` (dot-prefixed JSON basename).

### source

Everything that is neither `tests` nor `tooling`.

## scc dependency

`pnpm run cloc` requires the `scc` binary (Sloc, Cloc and Code by
[boyter/scc](https://github.com/boyter/scc)). The version is pinned in
`.mise.toml` under `"github:boyter/scc"` and installed by mise. CI uses the
mise-managed binary. Do not copy that version into this page or
[system-dependencies.md](system-dependencies.md).

The wrapper invokes `scc --format json --by-file --no-cocomo --no-complexity`.
Both the current (`{ languageSummary: [...] }`) and legacy (bare array) JSON
output shapes are parsed — the legacy shape was emitted by older `scc` releases.

Run `pnpm run cloc` to produce the report. Pass `SCC_BIN=<path>` to override the
binary (used in tests).
