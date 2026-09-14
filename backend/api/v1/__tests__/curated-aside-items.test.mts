import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestCommunity, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('GET /api/v1/curated-aside-items admin caller', () => {
  it('returns 400 when type is missing', async () => {
    const request = createRequest()
    await request.get('/api/v1/curated-aside-items').expect(400)
  })

  it('returns 422 when type is not a valid aside type', async () => {
    const request = createRequest()
    await request.get('/api/v1/curated-aside-items?type=invalid').expect(422)
  })

  it('returns items list for anonymous users with cache header', async () => {
    const request = createRequest()
    const response = await request.get('/api/v1/curated-aside-items?type=topic').expect(200)
    expect(Array.isArray(response.body.curated_aside_items)).toBe(true)
    expect(response.headers['cache-control']).toMatch(/public/)
  })

  it('returns items list for authenticated users without public cache header', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/curated-aside-items?type=topic').expect(200)
    expect(Array.isArray(response.body.curated_aside_items)).toBe(true)
    const cacheControl = response.headers['cache-control'] as string | undefined
    expect(cacheControl == null || !cacheControl.includes('public')).toBe(true)
  })
})

describe('GET /api/v1/curated-aside-items', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('returns 400 when type is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/curated-aside-items').expect(400)
  })

  it('returns 422 when type is not a valid aside type', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get('/api/v1/curated-aside-items?type=invalid').expect(422)
  })

  it('returns items list for admin', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request.get('/api/v1/curated-aside-items?type=topic').expect(200)
    expect(Array.isArray(response.body.curated_aside_items)).toBe(true)
  })
})

describe('POST /api/v1/curated-aside-items', () => {
  let admin: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    ;[admin, user] = await Promise.all([createTestUser({ administrator: true }), createTestUser()])
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.post('/api/v1/curated-aside-items').expect(401)
  })

  it('returns 403 for non-admin users', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/curated-aside-items')
      .send({ aside_type: 'topic', entity_id: randomUUID() })
      .expect(403)
  })

  it('returns 415 when content-type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/curated-aside-items')
      .set('Content-Type', 'text/plain')
      .send('aside_type=topic')
      .expect(415)
  })

  it('returns 400 when aside_type is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.post('/api/v1/curated-aside-items').send({ entity_id: randomUUID() }).expect(400)
  })

  it('returns 400 when entity_id is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.post('/api/v1/curated-aside-items').send({ aside_type: 'topic' }).expect(400)
  })

  it('returns 422 when aside_type is not a valid value', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/curated-aside-items')
      .send({ aside_type: 'invalid', entity_id: randomUUID() })
      .expect(422)
  })

  it('returns 422 when entity_id is not a valid UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/curated-aside-items')
      .send({ aside_type: 'topic', entity_id: 'not-a-uuid' })
      .expect(422)
  })

  it('returns 422 when position is out of SMALLINT range', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/curated-aside-items')
      .send({ aside_type: 'topic', entity_id: randomUUID(), position: 100000 })
      .expect(422)
  })

  it('creates a curated aside item and returns 201', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const entityId = await insertTestTopic({
      createdById: admin.id,
      name: `API Curated Topic ${Math.random().toString(36).slice(2, 10)}`,
      slug: `api-curated-topic-${Math.random().toString(36).slice(2, 10)}`,
    })
    const response = await request
      .post('/api/v1/curated-aside-items')
      .send({ aside_type: 'topic', entity_id: entityId, position: 0 })
      .expect(201)
    expect(response.body).toHaveProperty('curated_aside_item')
    expect(response.body.curated_aside_item.entity_id).toBe(entityId)
    expect(response.body.curated_aside_item.aside_type).toBe('topic')
    expect(response.body.curated_aside_item.entity_data).toMatchObject({
      entity_type: 'topic',
      id: entityId,
    })
  })

  it('returns 422 when the entity does not exist for the aside type', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post('/api/v1/curated-aside-items')
      .send({ aside_type: 'topic', entity_id: randomUUID() })
      .expect(422)
  })
})

describe('DELETE /api/v1/curated-aside-items/:id', () => {
  let admin: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    ;[admin, user] = await Promise.all([createTestUser({ administrator: true }), createTestUser()])
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete(`/api/v1/curated-aside-items/${randomUUID()}`).expect(401)
  })

  it('returns 403 for non-admin users', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/curated-aside-items/${randomUUID()}`).expect(403)
  })

  it('soft-deletes an item and returns 204', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const community = await insertTestCommunity({
      createdById: admin.id,
      name: `Delete Curated Community ${Math.random().toString(36).slice(2, 10)}`,
      slug: `delete-curated-community-${Math.random().toString(36).slice(2, 10)}`,
    })
    const createResponse = await request
      .post('/api/v1/curated-aside-items')
      .send({ aside_type: 'community', entity_id: community.id })
      .expect(201)

    const itemId = createResponse.body.curated_aside_item.id
    await request.delete(`/api/v1/curated-aside-items/${itemId}`).expect(204)
  })
})
