import { describe, expect, it } from 'vitest'

import {
  coverageConfigForScope,
  runtimeCoverageConfigForScope,
} from '../test-helpers/vitest-config/coverage-config.mts'

describe('Storybook browser coverage configuration', () => {
  it('uses project-relative runtime globs without changing suite descriptors', () => {
    expect(runtimeCoverageConfigForScope('web-storybook-browser').include).toEqual([
      'components/**/*.{ts,tsx}',
      'hooks/**/*.{ts,tsx}',
    ])
    expect(coverageConfigForScope('web-storybook-browser').include).toEqual([
      'web/components/**/*.{ts,tsx}',
      'web/hooks/**/*.{ts,tsx}',
    ])
  })
})
