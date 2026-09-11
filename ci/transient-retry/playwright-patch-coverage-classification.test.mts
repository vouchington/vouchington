import { describe, expect, it } from 'vitest'

import { getFailedPlaywrightShardNames } from './playwright-rules.mts'

const reusablePatchCoverageJobName = 'Patch Coverage / Patch Coverage'

describe('Playwright Patch Coverage classification', () => {
  it('rejects Patch Coverage as downstream of an ordinary Playwright shard', () => {
    expect(
      getFailedPlaywrightShardNames([
        'test-playwright / playwright-tests (1, 4)',
        reusablePatchCoverageJobName,
      ]),
    ).toBeNull()
  })

  it('accepts Patch Coverage as downstream of the Storybook coverage producer', () => {
    expect(
      getFailedPlaywrightShardNames(['storybook / storybook', reusablePatchCoverageJobName]),
    ).toEqual(['storybook / storybook'])
  })
})
