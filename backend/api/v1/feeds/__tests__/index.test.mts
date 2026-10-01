import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestCommunity } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'

describe('GET /api/v1/feeds/posts/:feed_type community scope failure', () => {
  it('returns a server error when a supported community lookup fails instead of ignoring its scope', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
    const request = createRequest()
    await request.authenticateAs(user)
    const requestId = crypto.randomUUID()
    const url = `/api/v1/feeds/posts/any?community=${encodeURIComponent(community.slug)}`

    const { result: response, error } = await withPostgresPoolQueryFailureForTest(
      '/* getCommunityBySlug */',
      async () => {
        await request.get(url).set('x-request-id', crypto.randomUUID()).expect(200)
        return request.get(url).set('x-request-id', requestId).expect(500)
      },
      { command: 'SELECT', requestId },
    )

    expect(error).toMatchObject({ code: '25P02' })
    expect(response.body).toMatchObject({
      code: '25P02',
      message: error.message,
      request_id: requestId,
    })
    expect(response.body).not.toHaveProperty('results')
    expect(response.body).not.toHaveProperty('posts')
    await request.get(url).set('x-request-id', requestId).expect(200)
  })
})
