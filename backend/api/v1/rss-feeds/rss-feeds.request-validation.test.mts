import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('RSS feed request validation', () => {
  it('keeps the literal nullable filter accepted at the HTTP boundary', async () => {
    const request = createRequest()

    await request.get('/api/v1/rss-feeds?enabled=NULL').expect(200)
    await request.get('/api/v1/rss-feeds?discoverable=null').expect(200)
  })

  it('preserves pagination clamping and malformed-limit errors before contract validation', async () => {
    const request = createRequest()

    await request.get('/api/v1/rss-feeds?limit=200').expect(200)
    await request.get('/api/v1/rss-feeds?limit=0').expect(400)
    await request.get('/api/v1/rss-feeds?limit=not-a-number').expect(400)
    await request.get('/api/v1/rss-feeds?after=not-a-cursor&topic=missing-topic').expect(400)
  })
})
