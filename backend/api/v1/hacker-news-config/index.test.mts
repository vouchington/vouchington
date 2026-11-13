import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { hackerNewsVisibilityConfig } from '@services/urls/hacker-news-visibility-config'
import { createTestUser } from '@voucha/test-helpers'

describe('GET /api/v1/hacker-news-config', () => {
  it('returns live visibility and range settings with anonymous public caching', async () => {
    const restore = overrideDynamicConfigFieldsForTest(hackerNewsVisibilityConfig, {
      references_visible: false,
      post_time_range_cap: '1m',
    })
    try {
      const response = await createRequest().get('/api/v1/hacker-news-config').expect(200)
      expect(response.headers['cache-control']).toBe('public')
      expect(response.body).toEqual({ references_visible: false, post_time_range_cap: '1m' })
    } finally {
      restore()
    }
  })

  it('keeps authenticated settings private', async () => {
    const request = createRequest()
    await request.authenticateAs(await createTestUser())
    const response = await request.get('/api/v1/hacker-news-config').expect(200)
    expect(response.headers['cache-control']).toBe('private, no-store')
  })
})
