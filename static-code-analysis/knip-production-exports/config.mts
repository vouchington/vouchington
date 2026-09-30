/**
 * Git pathspecs (glob magic) for the files removed before knip runs. Every backend package
 * declares a wildcard manifest export, which knip expands into production entries that also
 * match test files, so a test-only import keeps an export alive unless the file is absent.
 * Only `.mts` sources under the shared `test-helpers` package are listed: its `package.json`
 * must stay so `pnpm` keeps the workspace layout that `pnpm install` recorded.
 */
export const TEST_PATHSPECS = [
  ':(glob)backend/**/*.test.mts',
  ':(glob)backend/**/__tests__/**',
  ':(glob)backend/**/test-helpers.mts',
  ':(glob)backend/**/*.test-helpers.mts',
  ':(glob)backend/**/test-helpers/**/*.mts',
] as const

const WORKSPACES = [
  '@voucha/backend',
  '@voucha/api',
  '@entrypoints/*',
  '@services/*',
  '@modules/*',
  '@data-stores/*',
  '@queues/*',
  '@workers/*',
  '@flows/*',
  '@agents/*',
] as const

/**
 * Findings must not influence knip's exit code: `--max-issues` is raised so that a nonzero exit
 * always means knip failed, for example a configuration that does not load or configuration hints
 * treated as errors. Knip disables those hints in `--production` mode today; the flag keeps the
 * wrapper honest if that changes.
 */
export const KNIP_ARGS = [
  '--production',
  '--include-entry-exports',
  '--exports',
  ...WORKSPACES.flatMap(workspace => ['--workspace', workspace]),
  '--treat-config-hints-as-errors',
  '--max-issues',
  '2147483647',
  '--reporter',
  'json',
] as const

export const BASELINE_PATH = 'static-code-analysis/knip-production-exports/baseline.json'
export const UPDATE_COMMAND = 'pnpm run knip:production-exports --update'
export const KNIP_BIN = 'node_modules/knip/bin/knip.js'
