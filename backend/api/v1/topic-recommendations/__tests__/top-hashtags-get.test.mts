import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { encodeCursor } from '@modules/pagination'
import { v7 as uuidv7 } from 'uuid'

describe('GET /api/v1/topic-recommendations/top-hashtags', () => {
  it('requires authentication', async () => {
    await createRequest().get('/api/v1/topic-recommendations/top-hashtags').expect(401)
  })

  it('returns a typed paginated response and validates mapping', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user!)
    const response = await request.get('/api/v1/topic-recommendations/top-hashtags').expect(200)
    expect(response.body.results).toEqual(expect.any(Array))
    expect(response.body.topics).toEqual(expect.any(Object))
    expect(response.body.page_info).toMatchObject({ has_next_page: expect.any(Boolean) })
    await request.get('/api/v1/topic-recommendations/top-hashtags?mapping=unsupported').expect(422)
  })

  it('rejects cursors that omit the complete ranking tuple', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user!)
    const after = encodeCursor({ score: 1, id: uuidv7() })
    await request
      .get(`/api/v1/topic-recommendations/top-hashtags?after=${encodeURIComponent(after)}`)
      .expect(400)
  })

  it('accepts a cursor containing the complete top-hashtag ranking tuple', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user!)
    const after = encodeCursor({
      item_count: 3,
      latest_content_at: new Date().toISOString(),
      latest_content_id: uuidv7(),
      topic_alias_id: uuidv7(),
      scope: JSON.stringify({ q: null, mapping: 'all' }),
    })
    await request
      .get(`/api/v1/topic-recommendations/top-hashtags?after=${encodeURIComponent(after)}`)
      .expect(200)
  })
})
