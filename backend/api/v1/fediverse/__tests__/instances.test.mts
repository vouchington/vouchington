import { describe, expect, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
} from '@voucha/test-helpers/entities/fediverse-instances'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/fediverse/instances', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('preserves canonical text search and sorting while forcing the instance type', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const matching = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      name: `Unique instance ${random}`,
      hostname: `search-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: matching.id })
    const response = await createRequest()
      .get(`/api/v1/fediverse/instances?q=${random}&sort=relevance&rss_feed=true&omitLimit=true`)
      .expect(200)
    expect(response.body.results.map((result: { id: string }) => result.id)).toContain(matching.id)
    expect(
      Object.values(response.body.topics).every(
        (topic: any) => topic.topic_type === 'fediverse_instance',
      ),
    ).toBe(true)
  })

  it('returns metrics, markdown, hostname elections, and authenticated personalization sidecars', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      markdown: `Instance ${random}`,
      hostname: `sidecars-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id })
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request.get('/api/v1/fediverse/instances?sort=new&limit=100').expect(200)
    expect(response.body.topics_metrics).toBeDefined()
    expect(response.body.markdown_to_html).toBeDefined()
    const hostnameId = response.body.topics[topic.id].hostname.id
    expect(response.body.hostname_elections[hostnameId]).toBeDefined()
    expect(response.body.bookmarks).toBeDefined()
    expect(response.body.election_votes).toBeDefined()
  })

  it('returns an empty canonical response when text search has no match', async () => {
    const response = await createRequest()
      .get(`/api/v1/fediverse/instances?q=missing-${crypto.randomUUID()}`)
      .expect(200)
    expect(response.body).toMatchObject({
      results: [],
      topics: {},
      topics_metrics: {},
      fediverse_instances: {},
      topic_elections: {},
      hostname_elections: {},
      markdown_to_html: {},
    })
  })

  it('rejects a query with more hashtags than the search allows', async () => {
    const query = Array.from({ length: 11 }, (_, index) => `#tag${index}`).join(' ')
    await createRequest()
      .get(`/api/v1/fediverse/instances?q=${encodeURIComponent(query)}`)
      .expect(422)
  })

  it('returns fediverse instances with topic/election sidecars', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `list-basic-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id, software: 'mastodon' })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request.get('/api/v1/fediverse/instances?sort=new&limit=100').expect(200)

    expect(response.body.results.some((r: { id: string }) => r.id === topic.id)).toBe(true)
    expect(response.body.topics[topic.id]).toBeDefined()
    expect(response.body.fediverse_instances[topic.id]).toMatchObject({ software: 'mastodon' })
    expect(response.body.fediverse_instances[topic.id]).not.toHaveProperty('nodeinfo_raw')
    expect(response.body.fediverse_instances[topic.id]).not.toHaveProperty('integration_status')
    expect(response.body.topic_elections).toBeDefined()
  })

  it('filters by software', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const matching = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `filter-match-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({
      topicId: matching.id,
      software: `rare-software-${random}`,
    })
    const nonMatching = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `filter-nomatch-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: nonMatching.id, software: 'other' })

    const request = createRequest()
    const response = await request
      .get(`/api/v1/fediverse/instances?software=${encodeURIComponent(`rare-software-${random}`)}`)
      .expect(200)

    const ids = response.body.results.map((r: { id: string }) => r.id)
    expect(ids).toContain(matching.id)
    expect(ids).not.toContain(nonMatching.id)
  })

  it('keeps the unfiltered directory public but restricts integration status filters to admins', async () => {
    await createRequest().get('/api/v1/fediverse/instances?limit=1').expect(200)
    await createRequest().get('/api/v1/fediverse/instances?integration_status=approved').expect(403)

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(await createTestUser())
    await memberRequest.get('/api/v1/fediverse/instances?integration_status=approved').expect(403)
  })

  it('allows admins to filter by registrations and integration status', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    const approved = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `approved-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({
      topicId: approved.id,
      openRegistrations: true,
    })
    await insertTestFediverseInstanceIntegrationChange({
      topicId: approved.id,
      integrationStatus: 'approved',
      changedById: admin.id,
    })
    const closed = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `closed-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: closed.id, openRegistrations: false })
    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .get('/api/v1/fediverse/instances?open_registrations=true&integration_status=approved')
      .expect(200)
    const ids = response.body.results.map((result: { id: string }) => result.id)
    expect(ids).toContain(approved.id)
    expect(ids).not.toContain(closed.id)
  })

  it('continues with the opaque after cursor without duplicating the first page', async () => {
    const random = Math.random().toString(36).slice(2, 15)
    for (let index = 0; index < 2; index += 1) {
      const topic = await createTestTopic({
        user: admin,
        topic_type: 'fediverse_instance',
        name: `Cursor ${random} ${index}`,
        hostname: `cursor-${random}-${index}.example.com`,
      })
      await insertTestFediverseInstanceExtension({ topicId: topic.id })
    }
    const request = createRequest()
    await request.authenticateAs(admin)
    const first = await request
      .get(`/api/v1/fediverse/instances?q=${random}&sort=new&limit=1`)
      .expect(200)
    expect(first.body.page_info.has_next_page).toBe(true)
    const second = await request
      .get(
        `/api/v1/fediverse/instances?q=${random}&sort=new&limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)
    expect(second.body.results[0].id).not.toBe(first.body.results[0].id)
  })

  it('clamps the limit for anonymous callers but not authenticated callers', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    for (let i = 0; i < 30; i++) {
      const topic = await createTestTopic({
        user: admin,
        topic_type: 'fediverse_instance',
        hostname: `clamp-${random}-${i}.example.com`,
      })
      await insertTestFediverseInstanceExtension({ topicId: topic.id })
    }

    const anonResponse = await createRequest()
      .get('/api/v1/fediverse/instances?limit=100')
      .expect(200)
    expect(anonResponse.body.results.length).toBeLessThanOrEqual(25)

    const request = createRequest()
    await request.authenticateAs(admin)
    const authResponse = await request.get('/api/v1/fediverse/instances?limit=100').expect(200)
    expect(authResponse.body.results.length).toBeGreaterThan(25)
    expect(authResponse.body.results.length).toBeLessThanOrEqual(100)

    const omitLimitResponse = await request
      .get('/api/v1/fediverse/instances?limit=1&omitLimit=true')
      .expect(200)
    expect(omitLimitResponse.body.results).toHaveLength(1)
  })
})

describe('POST /api/v1/fediverse/instances', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 for unauthenticated callers', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    await createRequest()
      .post('/api/v1/fediverse/instances')
      .send({ hostname: `post-unauth-${random}.example.com` })
      .expect(401)
  })

  it('returns 422 for a missing hostname', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/fediverse/instances').send({}).expect(422)
  })

  it('creates a new instance and returns 201, then upvotes on a duplicate hostname with 200', async () => {
    const random = Math.random().toString(36).slice(2, 8)
    const hostname = `post-create-${random}.example.com`
    const request = createRequest()
    await request.authenticateAs(user)

    const created = await request.post('/api/v1/fediverse/instances').send({ hostname }).expect(201)
    expect(created.body.status).toBe('created')

    const upvoted = await request.post('/api/v1/fediverse/instances').send({ hostname }).expect(200)
    expect(upvoted.body.status).toBe('upvoted')
  })
})
