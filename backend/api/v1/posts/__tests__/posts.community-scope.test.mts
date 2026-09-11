import { describe, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { CONTRIBUTING_USER_AGE_MS, createTestUserWithAge } from '@voucha/test-helpers'

describe('POST /api/v1/posts community scope', () => {
  it('rejects explicit community scope on the generic posts API', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/posts')
      .send({
        post_type: 'discussion',
        title: 'Wrong endpoint',
        markdown: 'Use community posts API',
        community_id: null,
      })
      .expect(422)
  })
})
