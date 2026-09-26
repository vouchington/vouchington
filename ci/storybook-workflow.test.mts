import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

describe('storybook workflow', () => {
  it('runs browser tests through the optimizer watchdog wrapper', () => {
    const workflow = readFileSync('.github/workflows/storybook.yml', 'utf8')

    expect(workflow).toContain('pnpm exec ./ci/run-storybook-browser-tests.mts')
    expect(workflow).not.toContain(
      'VITEST_COVERAGE_SCOPE=web-storybook-browser pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-storybook-browser --coverage',
    )
  })

  it('allocates and exports a port immediately before the browser runner, preserving allocation failure', () => {
    const workflow = parse(readFileSync('.github/workflows/storybook.yml', 'utf8')) as {
      jobs: { storybook: { steps: { name?: string; run?: string }[] } }
    }
    const step = workflow.jobs.storybook.steps.find(
      item => item.name === 'Run Storybook browser tests',
    )
    expect(step?.run?.trim().split('\n')).toEqual([
      'VITEST_STORYBOOK_BROWSER_API_PORT=$(python3 ci/allocate-browser-safe-ports.py 1)',
      'export VITEST_STORYBOOK_BROWSER_API_PORT',
      'pnpm exec ./ci/run-storybook-browser-tests.mts',
    ])
  })
})
