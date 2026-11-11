import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'

describe('GET /api/v1/feeds/posts/any', () => {
  it('should return empty results when user has no follows', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/feeds/posts/any').expect(200)

    // Streaming pattern: posts, posts_metrics are objects, not arrays
    expect(response.body.posts).toEqual({})
    expect(response.body.posts_metrics).toEqual({})
    expect(response.body.results).toEqual([])
    const { has_next_page: hasNext, end_cursor: cursor } = response.body.page_info
    expect(hasNext ? typeof cursor === 'string' && cursor.length > 0 : cursor === null).toBe(true)
    const next = hasNext
      ? await request.get('/api/v1/feeds/posts/any').query({ after: cursor }).expect(200)
      : null
    expect(next?.body.results ?? []).toEqual([])
    expect(next?.body.posts ?? {}).toEqual({})
    expect(next?.body.posts_metrics ?? {}).toEqual({})
    expect(
      !next ||
        (next.body.page_info.has_next_page
          ? typeof next.body.page_info.end_cursor === 'string' &&
            next.body.page_info.end_cursor !== cursor
          : next.body.page_info.end_cursor === null),
    ).toBe(true)
  })
})
