import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('storybook workflow', () => {
  it('runs browser tests through the optimizer watchdog wrapper', () => {
    const workflow = readFileSync('.github/workflows/storybook.yml', 'utf8')

    expect(workflow).toContain('pnpm exec ./ci/run-storybook-browser-tests.mts')
    expect(workflow).not.toContain(
      'VITEST_COVERAGE_SCOPE=web-storybook-browser pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-storybook-browser --coverage',
    )
  })
})
