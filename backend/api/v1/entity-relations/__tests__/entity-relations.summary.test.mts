import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUserWithAge,
  insertTestPost,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

describe('entity-relations summary', () => {
  let user: PrivateUser

  function randomSlug(prefix: string): string {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  beforeAll(async () => {
    user = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS)
  })

  it('accepts summary only for post related URL reads and preserves the cursor envelope', async () => {
    const postId = await insertTestPost({
      title: 'Related URL summary',
      slug: randomSlug('related-url-summary'),
      createdById: user.id,
      markdown: 'Test content',
    })
    const request = createRequest()

    const response = await request
      .get(`/api/v1/entity-relations/post/${postId}/related/url?summary=true`)
      .expect(200)
    expect(response.body.results).toEqual([])
    expect(response.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })

    await request
      .get(`/api/v1/entity-relations/post/${postId}/category/topic?summary=true`)
      .expect(400)
    await request
      .get(`/api/v1/entity-relations/post/${postId}/related/url?summary=true&limit=5`)
      .expect(400)
  })
})
