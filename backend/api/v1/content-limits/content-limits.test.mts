import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightConfig } from '@services/copyright-notices/config'
import { postContentLimitsConfig } from '@services/post-content-limits'
import { userProductLimitsConfig } from '@services/user-product-limits'

describe('GET /api/v1/content-limits', () => {
  it('returns the configured post image, claimant target and follower recipient caps without caching', async () => {
    const restorePosts = overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
      post_images_max: 7,
    })
    const restoreCopyright = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      claimantTargetsMax: 9,
    })
    const restoreUsers = overrideDynamicConfigFieldsForTest(userProductLimitsConfig, {
      follower_distribution_recipients_max: 11,
    })
    try {
      const response = await createRequest().get('/api/v1/content-limits').expect(200)
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(response.body).toEqual({
        post_images_max: 7,
        copyright_claimant_targets_max: 9,
        follower_distribution_recipients_max: 11,
      })
    } finally {
      restorePosts()
      restoreCopyright()
      restoreUsers()
    }
  })
})
