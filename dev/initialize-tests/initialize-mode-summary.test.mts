import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupWorktreeDirs,
  makeWorktreeDir,
  runInitializeHelper,
} from '../test-helpers/initialize.mts'

// print_mode_summary's `case "$requested_mode"` branches read a fixed set of
// globals that main() normally assigns before calling it (port assignments,
// DB/Valkey identifiers, PRESERVED_CAPABILITY). set -euo pipefail means an
// unset one aborts the whole script, so every case below sets the full set
// even though a given branch only prints a subset of them.
const MODE_SUMMARY_GLOBALS = {
  WORKER_PORT: '4003',
  BACKEND_PORT: '4001',
  NEXT_PORT: '4002',
  IMAGE_LAMBDA_PORT: '4004',
  DB_NAME: 'voucha-test',
  DATABASE_URL: 'postgresql://localhost/voucha-test',
  VALKEY_CONTAINER: 'voucha-valkey-test',
  VALKEY_PORT: '6379',
  PRESERVED_CAPABILITY: '',
}

function exportGlobals(overrides: Partial<typeof MODE_SUMMARY_GLOBALS> = {}) {
  const globals = { ...MODE_SUMMARY_GLOBALS, ...overrides }
  return Object.entries(globals)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join(' ')
}

describe('dev/initialize print_mode_summary', () => {
  afterEach(async () => {
    await cleanupWorktreeDirs()
  })

  it('reminds the caller to source .env as the first web-mode step', async () => {
    const output = await runInitializeHelper({
      cwd: await makeWorktreeDir('feature-mode-summary-web-source-env'),
      script: `${exportGlobals()} print_mode_summary web`,
    })

    expect(output).toContain('1. Load env:       source .env')
    expect(output.indexOf('source .env')).toBeLessThan(output.indexOf('./dev/tmux'))
  })

  it('keeps the remaining web-mode steps numbered in order', async () => {
    const output = await runInitializeHelper({
      cwd: await makeWorktreeDir('feature-mode-summary-web-numbering'),
      script: `${exportGlobals()} print_mode_summary web`,
    })

    expect(output).toContain('2. Start services: ./dev/tmux')
    expect(output).toContain('3. Open browser:')
    expect(output).toContain('4. Check status:   ./dev/status')
  })

  it('still prints its own source .env reminder in backend mode', async () => {
    const output = await runInitializeHelper({
      cwd: await makeWorktreeDir('feature-mode-summary-backend-source-env'),
      script: `${exportGlobals()} print_mode_summary backend`,
    })

    expect(output).toContain('1. Run: source .env')
  })

  it('delegates to print_lower_mode_next_steps using the requested mode, not a global', async () => {
    // Regression guard: print_mode_summary's backend and monorepo branches
    // call print_lower_mode_next_steps "$requested_mode", not "$MODE" (which
    // main() sets but this harness never does). PRESERVED_CAPABILITY=web
    // routes through the branch that echoes "$requested_mode" verbatim, so
    // a revert to the unset global either prints "backend" wrong or aborts
    // outright with "MODE: unbound variable" under set -u.
    const output = await runInitializeHelper({
      cwd: await makeWorktreeDir('feature-mode-summary-backend-no-global-mode'),
      script: `${exportGlobals({ PRESERVED_CAPABILITY: 'web' })} print_mode_summary backend`,
    })

    expect(output).toContain('Web capability remains available after this backend refresh')
  })
})
