import { describe, expect, it } from 'vitest'

import { getFailedPlaywrightShardNames } from './playwright-rules.mts'

const reusablePatchCoverageJobName = 'coverage / Patch Coverage'

describe('Playwright Patch Coverage classification', () => {
  it('rejects Patch Coverage as downstream of an ordinary Playwright shard', () => {
    expect(
      getFailedPlaywrightShardNames(
        ['test-playwright / playwright-tests (1, 4)', reusablePatchCoverageJobName],
        'Web',
      ),
    ).toBeNull()
  })

  it('rejects coverage checks as downstream of the Storybook coverage producer', () => {
    expect(
      getFailedPlaywrightShardNames(['storybook / storybook', reusablePatchCoverageJobName], 'Web'),
    ).toBeNull()
  })
})
