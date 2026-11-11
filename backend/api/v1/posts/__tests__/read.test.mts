import { readStateExists } from '@voucha/test-helpers/entities/read-states'
import { describe, it, beforeAll, expect } from 'vitest'
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

describe('/api/v1/posts/:id/read for topic recommendations', () => {
  it('marks the recommendation and its comment read and unread for their creator', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `Read Recommendation ${createRandomString(8)}`,
      slug: `read-recommendation-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
      postType: 'topic_recommendation',
      privacy: 'private',
      broadcast: 'users',
      clearanceStatus: 'pending',
    })
    const stranger = await createTestUser()
    const outsider = createRequest()
    await outsider.authenticateAs(stranger)
    await outsider.put(`/api/v1/posts/${postId}/read`).expect(404)
    await outsider.delete(`/api/v1/posts/${postId}/read`).expect(404)
    expect(await readStateExists(stranger.id, 'post', postId)).toBe(false)
    const request = createRequest()
    await request.authenticateAs(user)
    await request.put(`/api/v1/posts/${postId}/read`).expect(204)
    expect(await readStateExists(user.id, 'post', postId)).toBe(true)
    await request.delete(`/api/v1/posts/${postId}/read`).expect(204)
    expect(await readStateExists(user.id, 'post', postId)).toBe(false)

    const commentId = await insertTestPost({
      title: `Read Recommendation Comment ${createRandomString(8)}`,
      slug: `read-recommendation-comment-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
      postType: 'comment',
      rootId: postId,
      parentId: postId,
    })
    await request.put(`/api/v1/posts/${commentId}/read`).expect(204)
    expect(await readStateExists(user.id, 'post', commentId)).toBe(true)
    await request.delete(`/api/v1/posts/${commentId}/read`).expect(204)
    expect(await readStateExists(user.id, 'post', commentId)).toBe(false)
  })
})
