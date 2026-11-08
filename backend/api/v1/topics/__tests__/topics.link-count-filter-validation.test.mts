import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('GET /api/v1/topics sort=link_count', () => {
  it('rejects search filters even when their results would be empty', async () => {
    const request = createRequest()
    const missing = crypto.randomUUID()

    await request
      .get('/api/v1/topics')
      .query({ sort: 'link_count', similar_topic: `missing-${missing}` })
      .expect(400)

    await request
      .get('/api/v1/topics')
      .query({ sort: 'link_count', q: `#missing-${missing}` })
      .expect(400)
  })
})
