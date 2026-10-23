import { describe, expect, it } from 'vitest'

import { hasStorybookViteOptimizerNewDepsReload } from './storybook-shared.mts'

describe('Storybook Vite new-deps optimizer reload fingerprint', () => {
  it('requires both the new-deps line and the optimizer reload marker', () => {
    expect(hasStorybookViteOptimizerNewDepsReload('new dependencies found: @pkg')).toBe(false)
    expect(
      hasStorybookViteOptimizerNewDepsReload('optimized dependencies changed. reloading'),
    ).toBe(false)
    expect(
      hasStorybookViteOptimizerNewDepsReload(
        'new dependencies found: @vouchington/session-jwt\noptimized dependencies changed. reloading',
      ),
    ).toBe(true)
  })
})
