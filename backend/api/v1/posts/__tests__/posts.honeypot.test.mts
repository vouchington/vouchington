import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { CONTRIBUTING_USER_AGE_MS, createTestUserWithAge } from '@voucha/test-helpers'
import { isUUIDv7 } from '@ts-shared/session-jwt'

describe('POST /api/v1/posts honeypot', () => {
  it('returns a complete fake post when honeypot field is filled', async () => {
    const user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/posts')
      .send({
        post_type: 'discussion',
        title: 'Spam Post',
        markdown: 'Spam content',
        hp_website: 'http://spam.example',
      })
      .expect(201)

    expect(response.body.post).toMatchObject({
      post_type: 'discussion',
      title: 'Spam Post',
      markdown: 'Spam content',
      clearance_status: 'pending',
      archived_at: null,
      archived_by_id: null,
      community_id: null,
    })
    expect(isUUIDv7(response.body.post.id)).toBe(true)
  })
})
