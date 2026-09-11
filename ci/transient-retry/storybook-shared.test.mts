import { describe, expect, it } from 'vitest'

import {
  hasStorybookViteOptimizerNewDepsReload,
  parseStorybookViteNewDependencies,
} from './storybook-shared.mts'

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

  it('parses package names from a local regex so matchAll cannot leak lastIndex', () => {
    const log = 'vite:deps new dependencies found: @vouchington/session-jwt, jose\n'
    expect(parseStorybookViteNewDependencies(log)).toEqual(['@vouchington/session-jwt', 'jose'])
    expect(parseStorybookViteNewDependencies(log)).toEqual(['@vouchington/session-jwt', 'jose'])
  })
})
