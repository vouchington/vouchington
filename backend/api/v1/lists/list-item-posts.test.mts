import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createRandomString, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/lists/:id/items/posts', () => {
  let user: PrivateUser
  let listId: string
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    postId = await insertTestPost({
      title: `Post API Test ${createRandomString(8)}`,
      slug: `post-api-test-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Post List ${createRandomString(8)}` })
    listId = r.body.list.id
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
      .expect(401)
  })

  it('adds a post to the list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
      .expect(201)
    expect(response.body.list_item.entity_id).toBe(postId)
    expect(response.body.list_item.item_type).toBe('post')
  })

  it('is idempotent on duplicate add', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
      .expect(201)
  })

  it('returns 403 for non-owner', async () => {
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
      .expect(403)
  })

  it('returns 422 when post_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({})
      .expect(422)
  })

  it('returns 404 when post_id does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: '00000000-0000-7000-8000-000000000000' })
      .expect(404)
  })

  it('returns 422 when post_id is not a valid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: 'not-a-uuid' })
      .expect(422)
  })
})

describe('DELETE /api/v1/lists/:id/items/posts/:entityId', () => {
  let user: PrivateUser
  let listId: string
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    postId = await insertTestPost({
      title: `Post Del Test ${createRandomString(8)}`,
      slug: `post-del-test-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Post Del List ${createRandomString(8)}` })
    listId = r.body.list.id
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request.delete(`/api/v1/lists/${listId}/items/posts/${postId}`).expect(401)
  })

  it('returns 403 for non-owner', async () => {
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    await request.delete(`/api/v1/lists/${listId}/items/posts/${postId}`).expect(403)
  })

  it('removes a post from the list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/lists/${listId}/items/posts/${postId}`).expect(204)
  })

  it('returns 422 for invalid UUID entityId', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/lists/${listId}/items/posts/not-a-uuid`).expect(422)
  })
})
