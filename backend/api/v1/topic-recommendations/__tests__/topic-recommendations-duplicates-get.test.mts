import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'

describe('GET /api/v1/topic-recommendations/duplicates', () => {
  it('returns 401 without authentication', async () => {
    const request = createRequest()

    await request
      .get(
        `/api/v1/topic-recommendations/duplicates?topic_title=Test+Topic&topic_slug=test-topic-${Date.now()}`,
      )
      .expect(401)
  })

  it('returns 200 with correct result shape when authenticated and no match exists', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const random = `no-match-route-${Date.now()}`
    const response = await request
      .get(
        `/api/v1/topic-recommendations/duplicates?topic_title=No+Match+Route+Topic+${random}&topic_slug=no-match-route-topic-${random}`,
      )
      .expect(200)

    expect(response.body).toHaveProperty('exact_topic', null)
    expect(Array.isArray(response.body.pending_recommendations)).toBe(true)
    expect(Array.isArray(response.body.similar_topics)).toBe(true)
    expect(response.body.pending_recommendations).toHaveLength(0)
  })

  it('returns exact_topic when a published topic exists with the same slug', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const topic = await createTestTopic()

    const response = await request
      .get(
        `/api/v1/topic-recommendations/duplicates?topic_title=${encodeURIComponent(topic.name)}&topic_slug=${encodeURIComponent(topic.slug)}`,
      )
      .expect(200)

    expect(response.body.exact_topic).not.toBeNull()
    expect(response.body.exact_topic.id).toBe(topic.id)
    expect(response.body.exact_topic.slug).toBe(topic.slug)
    expect(Array.isArray(response.body.pending_recommendations)).toBe(true)
    expect(Array.isArray(response.body.similar_topics)).toBe(true)
  })

  it('handles topic_aliases query param by splitting on comma', async () => {
    const user = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(user)

    const random = `aliases-route-${Date.now()}`
    const response = await request
      .get(
        `/api/v1/topic-recommendations/duplicates?topic_title=Alias+Route+Topic+${random}&topic_slug=alias-route-topic-${random}&topic_aliases=alias-one-${random},alias-two-${random}`,
      )
      .expect(200)

    expect(response.body).toHaveProperty('exact_topic', null)
    expect(Array.isArray(response.body.pending_recommendations)).toBe(true)
    expect(Array.isArray(response.body.similar_topics)).toBe(true)
  })
})
