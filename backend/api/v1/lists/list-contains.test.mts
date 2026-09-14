import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createRandomString, insertTestPost } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/lists/contains', () => {
  let user: PrivateUser
  let listId: string
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()
    postId = await insertTestPost({
      title: `Contains Post ${createRandomString(8)}`,
      slug: `contains-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })
    const request = createRequest()
    await request.authenticateAs(user)
    const r = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `Contains List ${createRandomString(8)}` })
    listId = r.body.list.id
    await request
      .post(`/api/v1/lists/${listId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
  })

  it('returns 401 without auth', async () => {
    const request = createRequest()
    await request
      .get('/api/v1/lists/contains')
      .query({ item_type: 'post', entity_id: postId })
      .expect(401)
  })

  it('returns list IDs containing the entity', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get('/api/v1/lists/contains')
      .query({ item_type: 'post', entity_id: postId })
      .expect(200)
    expect(Array.isArray(response.body.list_ids)).toBe(true)
    expect(response.body.list_ids).toContain(listId)
  })

  it('returns empty array when entity not in any list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get('/api/v1/lists/contains')
      .query({ item_type: 'post', entity_id: '00000000-0000-7000-8000-000000000000' })
      .expect(200)
    expect(response.body.list_ids).toEqual([])
  })

  it('returns 422 when item_type is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/lists/contains').query({ entity_id: postId }).expect(422)
  })

  it('returns 422 when entity_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/lists/contains').query({ item_type: 'post' }).expect(422)
  })

  it('returns 422 for invalid item_type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .get('/api/v1/lists/contains')
      .query({ item_type: 'invalid', entity_id: postId })
      .expect(422)
  })

  it('returns 422 for non-UUID entity_id', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .get('/api/v1/lists/contains')
      .query({ item_type: 'post', entity_id: 'not-a-uuid' })
      .expect(422)
  })
})
