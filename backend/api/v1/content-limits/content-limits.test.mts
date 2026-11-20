import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { copyrightConfig } from '@services/copyright-notices/config'
import { postContentLimitsConfig } from '@services/post-content-limits'

describe('GET /api/v1/content-limits', () => {
  it('returns the configured post image and claimant target caps without caching', async () => {
    const restorePosts = overrideDynamicConfigFieldsForTest(postContentLimitsConfig, {
      post_images_max: 7,
    })
    const restoreCopyright = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      claimantTargetsMax: 9,
    })
    try {
      const response = await createRequest().get('/api/v1/content-limits').expect(200)
      expect(response.headers['cache-control']).toBe('private, no-store')
      expect(response.body).toEqual({ post_images_max: 7, copyright_claimant_targets_max: 9 })
    } finally {
      restorePosts()
      restoreCopyright()
    }
  })
})
