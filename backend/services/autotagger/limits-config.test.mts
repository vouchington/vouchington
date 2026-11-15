import { describe, expect, it } from 'vitest'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { autotaggerPaidLimitsConfig, getAutotaggerPaidLimitsFields } from './limits-config.mts'

describe('autotagger topic ceilings', () => {
  it('bounds every topic budget from existing stored configuration', () => {
    const restore = overrideDynamicConfigFieldsForTest(autotaggerPaidLimitsConfig, {
      post_free_max_topics: 21,
      post_plus_max_topics: 100,
      post_pro_max_topics: 20,
      rss_discoverable_llm_max_topics: -1,
      rss_collaborative_plus_max_topics: 2.9,
    })
    try {
      expect(getAutotaggerPaidLimitsFields()).toMatchObject({
        post_free_max_topics: 20,
        post_plus_max_topics: 20,
        post_pro_max_topics: 20,
        rss_discoverable_llm_max_topics: 0,
        rss_collaborative_plus_max_topics: 2,
        rss_collaborative_pro_max_topics: 4,
      })
    } finally {
      restore()
    }
  })
})
