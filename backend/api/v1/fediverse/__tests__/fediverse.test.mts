import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('GET /api/v1/fediverse/search', () => {
  it('returns an empty bucket list for anonymous callers and sets public cache headers, without querying any provider', async () => {
    // q="a" is below searchFediverse's 2-char minimum, so this exercises the early return
    // without reaching any provider adapter (and thus without needing network mocks).
    const request = createRequest()
    const response = await request.get('/api/v1/fediverse/search?q=a').expect(200)

    expect(response.headers['cache-control']).toMatch(/public/)
    expect(response.body).toEqual({ buckets: [] })
  })

  it('rejects unsupported providers', async () => {
    const request = createRequest()
    const response = await request
      .get('/api/v1/fediverse/search?q=social&providers=activitypub')
      .expect(400)

    expect(response.body.message).toContain('Unsupported Fediverse provider')
  })

  it('rejects unsupported result types', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/fediverse/search?q=social&type=review').expect(400)

    expect(response.body.message).toContain('Unsupported Fediverse result type')
  })

  it('rejects oversized after values', async () => {
    const request = createRequest()
    const response = await request
      .get(`/api/v1/fediverse/search?q=social&after=${'x'.repeat(513)}`)
      .expect(400)

    expect(response.body.message).toContain('Cursor is too long')
  })

  it('rejects the legacy cursor query parameter', async () => {
    const request = createRequest()
    await request.get('/api/v1/fediverse/search?q=social&cursor=legacy').expect(400)
  })

  it('rejects a repeated after query key', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/fediverse/search?q=a&after=a&after=b').expect(422)

    expect(response.body.message).toContain('Invalid after')
  })

  it('rejects a repeated q query key', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/fediverse/search?q=a&q=b').expect(422)

    expect(response.body.message).toContain('Invalid q')
  })

  it('treats an empty q value as an empty result', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/fediverse/search?q=').expect(200)

    expect(response.body).toEqual({ buckets: [] })
  })

  it('treats an empty after value as the first page', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/fediverse/search?q=a&after=').expect(200)

    expect(response.body).toEqual({ buckets: [] })
  })
})
