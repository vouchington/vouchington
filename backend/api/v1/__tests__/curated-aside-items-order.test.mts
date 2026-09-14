import { beforeAll, describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestRssFeed, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { randomUUID } from 'node:crypto'

describe('PUT /api/v1/curated-aside-items/order', () => {
  let admin: PrivateUser
  let user: PrivateUser

  beforeAll(async () => {
    ;[admin, user] = await Promise.all([createTestUser({ administrator: true }), createTestUser()])
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.put('/api/v1/curated-aside-items/order').expect(401)
  })

  it('returns 403 for non-admin users', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .put('/api/v1/curated-aside-items/order')
      .send({ aside_type: 'topic', item_ids: [] })
      .expect(403)
  })

  it('returns 415 when content-type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .put('/api/v1/curated-aside-items/order')
      .set('Content-Type', 'text/plain')
      .send('aside_type=topic')
      .expect(415)
  })

  it('returns 400 when aside_type is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.put('/api/v1/curated-aside-items/order').send({ item_ids: [] }).expect(400)
  })

  it('returns 422 when aside_type is not a valid value', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .put('/api/v1/curated-aside-items/order')
      .send({ aside_type: 'invalid', item_ids: [] })
      .expect(422)
  })

  it('returns 400 when item_ids is not an array of strings', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .put('/api/v1/curated-aside-items/order')
      .send({ aside_type: 'topic', item_ids: [123] })
      .expect(400)
  })

  it('returns 422 when item_ids contains non-UUID strings', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .put('/api/v1/curated-aside-items/order')
      .send({ aside_type: 'topic', item_ids: ['not-a-uuid'] })
      .expect(422)
  })

  it('returns 422 when item_ids contains duplicate UUIDs', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)
    const id = randomUUID()
    await request
      .put('/api/v1/curated-aside-items/order')
      .send({ aside_type: 'topic', item_ids: [id, id] })
      .expect(422)
  })

  it('reorders items and returns 204', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const topicId1 = await insertTestTopic({
      createdById: admin.id,
      name: `Order Source Topic ${Math.random().toString(36).slice(2, 10)}`,
      slug: `order-source-topic-${Math.random().toString(36).slice(2, 10)}`,
    })
    const topicId2 = await insertTestTopic({
      createdById: admin.id,
      name: `Order Source Topic ${Math.random().toString(36).slice(2, 10)}`,
      slug: `order-source-topic-${Math.random().toString(36).slice(2, 10)}`,
    })
    const sourceId1 = await insertTestRssFeed({ topicId: topicId1, title: 'Order Source 1' })
    const sourceId2 = await insertTestRssFeed({ topicId: topicId2, title: 'Order Source 2' })

    const [id1, id2] = await Promise.all([
      request
        .post('/api/v1/curated-aside-items')
        .send({ aside_type: 'source', entity_id: sourceId1 })
        .expect(201)
        .then(r => r.body.curated_aside_item.id as string),
      request
        .post('/api/v1/curated-aside-items')
        .send({ aside_type: 'source', entity_id: sourceId2 })
        .expect(201)
        .then(r => r.body.curated_aside_item.id as string),
    ])

    await request
      .put('/api/v1/curated-aside-items/order')
      .send({ aside_type: 'source', item_ids: [id2, id1] })
      .expect(204)
  })
})
