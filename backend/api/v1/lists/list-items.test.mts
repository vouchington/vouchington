import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createRandomString,
  insertTestPost,
  insertTestTopic,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/lists/:id/items', () => {
  let user: PrivateUser
  let publicListId: string
  let privateListId: string
  let postId: string

  beforeAll(async () => {
    user = await createTestUser()

    await insertTestTopic({
      name: `Items Route Topic ${createRandomString(8)}`,
      slug: `items-route-topic-${createRandomString(8)}`,
      createdById: user.id,
    })
    postId = await insertTestPost({
      title: `Items Route Post ${createRandomString(8)}`,
      slug: `items-route-post-${createRandomString(8)}`,
      createdById: user.id,
      markdown: 'content',
    })

    const request = createRequest()
    await request.authenticateAs(user)

    const r1 = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `ItemsPublic ${createRandomString(8)}`, visibility: 'public' })
    publicListId = r1.body.list.id

    const r2 = await request
      .post('/api/v1/lists')
      .set('Content-Type', 'application/json')
      .send({ name: `ItemsPrivate ${createRandomString(8)}`, visibility: 'private' })
    privateListId = r2.body.list.id

    await request
      .post(`/api/v1/lists/${publicListId}/items/posts`)
      .set('Content-Type', 'application/json')
      .send({ post_id: postId })
  })

  it('returns items for a public list without auth', async () => {
    const request = createRequest()
    const response = await request.get(`/api/v1/lists/${publicListId}/items`).expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body).toHaveProperty('page_info')
    expect(response.body).toHaveProperty('list_items')
  })

  it('returns 404 for private list without auth', async () => {
    const request = createRequest()
    await request.get(`/api/v1/lists/${privateListId}/items`).expect(404)
  })

  it('returns items for owner accessing private list', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/lists/${privateListId}/items`).expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
  })

  it('returns added post in item list', async () => {
    const request = createRequest()
    const response = await request.get(`/api/v1/lists/${publicListId}/items`).expect(200)
    const items = Object.values(response.body.list_items) as Array<{ entity_id: string }>
    const found = items.find(i => i.entity_id === postId)
    expect(found).toBeDefined()
  })

  it('filters by media_type query param', async () => {
    const request = createRequest()
    const response = await request
      .get(`/api/v1/lists/${publicListId}/items`)
      .query({ media_type: 'video' })
      .expect(200)
    // No video items, so results should be empty
    expect(response.body.results).toHaveLength(0)
  })

  it('accepts read=true query param for authenticated owner', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get(`/api/v1/lists/${publicListId}/items`)
      .query({ read: 'true' })
      .expect(200)
    // No items marked read, so results should be empty
    expect(response.body.results).toHaveLength(0)
  })

  it('accepts read=false query param and returns unread items for authenticated owner', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .get(`/api/v1/lists/${publicListId}/items`)
      .query({ read: 'false' })
      .expect(200)
    // Post is unread, so it should appear
    const items = Object.values(response.body.list_items) as Array<{ entity_id: string }>
    const found = items.find(i => i.entity_id === postId)
    expect(found).toBeDefined()
  })
})
