import { describe, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createRandomString, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('PUT /api/v1/posts/:id/read', () => {
  let user: PrivateUser
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    postId = await insertTestPost({
      title: `Read PUT Post ${createRandomString(8)}`,
      slug: `read-put-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request.put(`/api/v1/posts/${postId}/read`).expect(401)
  })

  it('marks a post as read (204)', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/posts/${postId}/read`).expect(204)
  })

  it('is idempotent', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/posts/${postId}/read`).expect(204)
  })

  it('returns 422 for invalid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put('/api/v1/posts/not-a-uuid/read').expect(422)
  })
})

describe('DELETE /api/v1/posts/:id/read', () => {
  let user: PrivateUser
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    postId = await insertTestPost({
      title: `Read DEL Post ${createRandomString(8)}`,
      slug: `read-del-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request.delete(`/api/v1/posts/${postId}/read`).expect(401)
  })

  it('marks a post as unread (204)', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/posts/${postId}/read`).expect(204)
    await request.delete(`/api/v1/posts/${postId}/read`).expect(204)
  })

  it('is a no-op when post is not read', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/posts/${postId}/read`).expect(204)
  })

  it('returns 422 for invalid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/posts/not-a-uuid/read').expect(422)
  })
})
