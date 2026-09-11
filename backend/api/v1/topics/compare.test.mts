import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { HTTP_CACHE_LONG_MAX_AGE_SECONDS } from '@voucha/config'

describe('GET /api/v1/topics/compare', () => {
  let slugA: string
  let slugB: string
  let topicIdA: string
  let topicIdB: string

  beforeAll(async () => {
    const admin = await createTestUser({ administrator: true })
    const rand = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    const topicA = await createTestTopic({
      user: admin,
      name: `Compare Test A ${rand}`,
      slug: `compare-test-a-${rand}`,
    })
    const topicB = await createTestTopic({
      user: admin,
      name: `Compare Test B ${rand}`,
      slug: `compare-test-b-${rand}`,
    })
    slugA = topicA.slug
    slugB = topicB.slug
    topicIdA = topicA.id
    topicIdB = topicB.id
  }, 30_000)

  it('returns 200 with expected fields for two valid slugs', async () => {
    const req = createRequest()
    const response = await req.get(`/api/v1/topics/compare?slugs=${slugA},${slugB}`).expect(200)

    expect(response.body).toHaveProperty('topics')
    expect(response.body.topics).toHaveProperty(topicIdA)
    expect(response.body.topics).toHaveProperty(topicIdB)

    expect(response.body).toHaveProperty('topic_metrics')
    expect(response.body.topic_metrics).toHaveProperty(topicIdA)
    expect(response.body.topic_metrics).toHaveProperty(topicIdB)

    expect(response.body).toHaveProperty('topic_elections')

    expect(response.body).toHaveProperty('topic_categories')
    expect(response.body.topic_categories).toHaveProperty(topicIdA)
    expect(response.body.topic_categories).toHaveProperty(topicIdB)

    expect(response.body).toHaveProperty('data_point_insights')
    expect(response.body.data_point_insights).toHaveProperty(topicIdA)
    expect(response.body.data_point_insights).toHaveProperty(topicIdB)
  })

  it('sets Cache-Control for anonymous requests', async () => {
    const req = createRequest()
    const response = await req.get(`/api/v1/topics/compare?slugs=${slugA},${slugB}`).expect(200)

    expect(response.headers['cache-control']).toContain('public')
    expect(response.headers['cache-control']).toContain(
      `max-age=${HTTP_CACHE_LONG_MAX_AGE_SECONDS}`,
    )
  })

  it('returns 400 when slugs param is missing', async () => {
    const req = createRequest()
    await req.get('/api/v1/topics/compare').expect(400)
  })

  it('returns 400 when only one slug is provided', async () => {
    const req = createRequest()
    await req.get(`/api/v1/topics/compare?slugs=${slugA}`).expect(400)
  })

  it('returns 400 when more than two slugs are provided', async () => {
    const req = createRequest()
    await req.get(`/api/v1/topics/compare?slugs=${slugA},${slugB},extra-slug`).expect(400)
  })

  it('returns 404 when one or more topics are not found', async () => {
    const req = createRequest()
    await req
      .get('/api/v1/topics/compare?slugs=nonexistent-slug-abc,nonexistent-slug-xyz')
      .expect(404)
  })
})
