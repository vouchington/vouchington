import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('GET /api/v1/topics/publisher-types', () => {
  it('returns 200 with publisher_types array', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/topics/publisher-types').expect(200)
    expect(Array.isArray(response.body.publisher_types)).toBe(true)
  })

  it('each item has id, slug, and label fields', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/topics/publisher-types').expect(200)
    for (const item of response.body.publisher_types as Record<string, unknown>[]) {
      expect(typeof item.id).toBe('string')
      expect(typeof item.slug).toBe('string')
      expect(typeof item.label).toBe('string')
    }
  })

  it('returns a long-lived cache-control header', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/topics/publisher-types').expect(200)
    expect(response.headers['cache-control']).toBe('public')
  })
})
