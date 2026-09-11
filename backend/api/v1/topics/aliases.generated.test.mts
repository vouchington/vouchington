import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createRandomString, createTestUser, createTestTopic } from '@voucha/test-helpers'
describe('GET /api/v1/topics/aliases', () => {
  let topicId: string
  let aliasPrefix: string

  beforeAll(async () => {
    const user = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: user! })
    topicId = topic.id
    aliasPrefix = `test-alias-search-${createRandomString(12).toLowerCase()}`

    // Create an alias via the API
    const request = createRequest()
    await request.authenticateAs(user!)
    await request
      .post(`/api/v1/topics/${topicId}/aliases`)
      .send({ aliases: aliasPrefix })
      .expect(201)
  })

  it('should return 401 for unauthenticated users', async () => {
    const request = createRequest()
    await request.get('/api/v1/topics/aliases').query({ q: 'test' }).expect(401)
  })

  it('should return 403 for non-admin users', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user!)
    await request.get('/api/v1/topics/aliases').query({ q: 'test' }).expect(403)
  })

  it('should return 400 when q is missing', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)
    await request.get('/api/v1/topics/aliases').expect(400)
  })

  it('should return results for prefix query', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)
    const response = await request
      .get('/api/v1/topics/aliases')
      .query({ q: aliasPrefix })
      .expect(200)

    expect(response.body.results).toBeDefined()
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
  })

  it('should return empty results for non-matching query', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)
    const response = await request
      .get('/api/v1/topics/aliases')
      .query({ q: 'zzz-no-match-xyz-abc' })
      .expect(200)

    expect(response.body.results).toEqual([])
  })

  it('should return results with topic info', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)
    const response = await request
      .get('/api/v1/topics/aliases')
      .query({ q: aliasPrefix })
      .expect(200)

    expect(response.body.results.length).toBeGreaterThan(0)
    const result = response.body.results[0]
    expect(result).toHaveProperty('alias')
    expect(result).toHaveProperty('topic_id')
    expect(result).toHaveProperty('topic')
    expect(result.topic).toHaveProperty('id')
    expect(result.topic).toHaveProperty('name')
  })
})

describe('GET /api/v1/topics/:idOrSlug/aliases', () => {
  it('should return 401 for unauthenticated users', async () => {
    const topic = await createTestTopic()
    const request = createRequest()
    await request.get(`/api/v1/topics/${topic.id}/aliases`).expect(401)
  })

  it('should return 403 for non-admin users', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user! })
    const request = createRequest()
    await request.authenticateAs(user!)
    await request.get(`/api/v1/topics/${topic.id}/aliases`).expect(403)
  })

  it('should return 404 for unknown topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)
    await request.get('/api/v1/topics/non-existent-topic-slug-xyz/aliases').expect(404)
  })

  it('should return empty aliases for topic with no aliases', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const request = createRequest()
    await request.authenticateAs(admin!)
    const response = await request.get(`/api/v1/topics/${topic.id}/aliases`).expect(200)

    expect(response.body.results).toEqual([])
    expect(response.body.page_info).toBeDefined()
    expect(response.body.page_info.has_next_page).toBe(false)
  })

  it('should return aliases for topic with aliases', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin! })
    const aliasValue = `test-alias-get-${createRandomString(12).toLowerCase()}`

    const writeRequest = createRequest()
    await writeRequest.authenticateAs(admin!)
    await writeRequest
      .post(`/api/v1/topics/${topic.id}/aliases`)
      .send({ aliases: aliasValue })
      .expect(201)

    const readRequest = createRequest()
    await readRequest.authenticateAs(admin!)
    const response = await readRequest.get(`/api/v1/topics/${topic.id}/aliases`).expect(200)

    expect(response.body.results).toContain(aliasValue)
    expect(response.body.alias_records).toContainEqual(
      expect.objectContaining({ alias: aliasValue }),
    )
  })
})

describe('POST /api/v1/topics/:idOrSlug/aliases', () => {
  it('should return 401 for unauthenticated users', async () => {
    const topic = await createTestTopic()
    const request = createRequest()
    await request
      .post(`/api/v1/topics/${topic.id}/aliases`)
      .send({ aliases: 'some-alias' })
      .expect(401)
  })

  it('should return 403 for non-admin users', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user! })
    const request = createRequest()
    await request.authenticateAs(user!)
    await request
      .post(`/api/v1/topics/${topic.id}/aliases`)
      .send({ aliases: 'some-alias' })
      .expect(403)
  })

  it('should return 404 for unknown topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin!)
    await request
      .post('/api/v1/topics/non-existent-topic-slug-xyz/aliases')
      .send({ aliases: 'some-alias' })
      .expect(404)
  })

  it('should return 400 when aliases is missing', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin! })
    const request = createRequest()
    await request.authenticateAs(admin!)
    await request.post(`/api/v1/topics/${topic.id}/aliases`).send({}).expect(400)
  })

  it('should return 400 when aliases is not a string or array', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin! })
    const request = createRequest()
    await request.authenticateAs(admin!)
    await request.post(`/api/v1/topics/${topic.id}/aliases`).send({ aliases: 123 }).expect(400)
  })

  it('should create aliases successfully', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin! })
    const aliasValue = `test-alias-create-${createRandomString(12).toLowerCase()}`

    const request = createRequest()
    await request.authenticateAs(admin!)
    const response = await request
      .post(`/api/v1/topics/${topic.id}/aliases`)
      .send({ aliases: aliasValue })
      .expect(201)

    expect(response.body.added).toBeDefined()
  })

  it('rejects an alias already linked to another topic', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic1 = await createTestTopic({ user: admin! })
    const topic2 = await createTestTopic({ user: admin! })
    const aliasValue = `test-alias-conflict-${createRandomString(12).toLowerCase()}`

    const request1 = createRequest()
    await request1.authenticateAs(admin!)
    await request1
      .post(`/api/v1/topics/${topic1.id}/aliases`)
      .send({ aliases: aliasValue })
      .expect(201)

    const request2 = createRequest()
    await request2.authenticateAs(admin!)
    await request2
      .post(`/api/v1/topics/${topic2.id}/aliases`)
      .send({ aliases: aliasValue })
      .expect(409)
  })
})

describe('DELETE /api/v1/topics/:idOrSlug/aliases/:alias', () => {
  it('returns 422 for a malformed alias UUID when linking', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.post(`/api/v1/topics/${topic.id}/aliases/not-a-uuid`).expect(422)
  })

  it('should return 401 for unauthenticated users', async () => {
    const topic = await createTestTopic()
    const request = createRequest()
    await request.delete(`/api/v1/topics/${topic.id}/aliases/some-alias`).expect(401)
  })

  it('should return 403 for non-admin users', async () => {
    const user = await createTestUser()
    const topic = await createTestTopic({ user: user! })
    const request = createRequest()
    await request.authenticateAs(user!)
    await request.delete(`/api/v1/topics/${topic.id}/aliases/some-alias`).expect(403)
  })

  it('should delete alias successfully', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin! })
    const aliasValue = `test-alias-delete-${topic.id.slice(0, 8)}`

    // Create alias first
    const createReq = createRequest()
    await createReq.authenticateAs(admin!)
    const created = await createReq
      .post(`/api/v1/topics/${topic.id}/aliases`)
      .send({ aliases: aliasValue })
      .expect(201)

    // Delete alias
    const deleteReq = createRequest()
    await deleteReq.authenticateAs(admin!)
    await deleteReq
      .delete(`/api/v1/topics/${topic.id}/aliases/${created.body.added[0].id}`)
      .expect(204)

    // Verify deleted
    const readReq = createRequest()
    await readReq.authenticateAs(admin!)
    const response = await readReq.get(`/api/v1/topics/${topic.id}/aliases`).expect(200)
    expect(response.body.results).not.toContain(aliasValue)
  })

  it('accepts the legacy alias value when deleting', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic({ user: admin })
    const aliasValue = `legacy-alias-delete-${topic.id.slice(0, 8)}`
    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post(`/api/v1/topics/${topic.id}/aliases`)
      .send({ aliases: aliasValue })
      .expect(201)

    await request.delete(`/api/v1/topics/${topic.id}/aliases/${aliasValue}`).expect(204)
  })
})
