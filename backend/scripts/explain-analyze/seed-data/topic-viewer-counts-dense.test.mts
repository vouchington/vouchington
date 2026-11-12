import { describe, expect, it } from 'vitest'
import { profileCountConfig } from '@services/users/profile-count-cap'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { getDenseTopicViewerCounts } from './topic-viewer-counts-dense.mts'

describe('dense viewer fixture output caps', () => {
  it.each([
    { cap: 50, discussions: 50, reviews: 50, discussionCapped: true },
    { cap: 200, discussions: 200, reviews: 200, discussionCapped: false },
    { cap: 1000, discussions: 200, reviews: 1000, discussionCapped: false },
    { cap: 2000, discussions: 200, reviews: 1000, discussionCapped: false },
  ])(
    'respects profile cap $cap under the declared full input fixture',
    async ({ cap, discussions, reviews, discussionCapped }) => {
      await profileCountConfig.waitForInitialization()
      const restore = overrideDynamicConfigFieldsForTest(profileCountConfig, { count_cap: cap })
      try {
        expect(getDenseTopicViewerCounts()).toEqual({
          discussions,
          reviews,
          'data-points': reviews,
          count_capped: { discussions: discussionCapped, reviews: true, 'data-points': true },
        })
      } finally {
        restore()
      }
    },
  )
})
