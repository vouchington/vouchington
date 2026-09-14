import { beforeAll, describe, expect, it } from 'vitest'

import { createRequest } from '@voucha/test-helpers/api/server'
import {
  CONTRIBUTING_USER_AGE_MS,
  createTestUser,
  createTestUserWithAge,
  createTestTopic,
  getRssFeedImportFollowForTest,
  getTopicImportRequestForTest,
  getTopicImportRequestCountByRecommendationForTest,
} from '@voucha/test-helpers'

import type { PrivateUser } from '@services/users/types'

import { getRssFeedImport } from '@services/user-import-export/rss-feed-imports'
import {
  admitImportedTopicRecommendation,
  stableTopicImportIdempotencyKey,
} from '@services/user-import-export/admit-topic-recommendation'
import { prepareTopicInput } from '@services/user-import-export/import-topics-queries'
import {
  claimContributionAdmission,
  discardRejectedContributionAdmission,
} from '@services/contribution-gating/admission-reservations'

describe('POST /api/v1/my/import/topics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .send({ names: ['Technology'] })
      .expect(401)
  })

  it('returns 400 when names is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .send({})
      .expect(400)
  })

  it('rejects a malformed import attempt identity before importing topics', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', 'not-a-uuid')
      .send({ names: ['Technology'] })
      .expect(400)
  })

  it('imports topic names and returns results', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .send({ names: ['Nonexistent Import Test Topic XYZ'] })
      .expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.results).toHaveLength(1)
    expect(['recommendation_created', 'error']).toContain(response.body.results[0].status)
  })

  it('accepts a topic import body larger than the former 10 KiB cap', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .send({ names: [`Oversized ${'x'.repeat(12 * 1024)}`] })
      .expect(200)

    expect(response.body.results).toHaveLength(1)
  })

  it('returns a retryable response for an in-progress recommendation and replays the attempt', async () => {
    const administrator = await createTestUserWithAge(CONTRIBUTING_USER_AGE_MS, {
      administrator: true,
    })
    const existingTopic = await createTestTopic({ user: administrator })
    const importAttemptId = crypto.randomUUID()
    const topicNames = [
      existingTopic.name,
      `Concurrent import first ${crypto.randomUUID()}`,
      `Concurrent import second ${crypto.randomUUID()}`,
    ]
    const input = prepareTopicInput(topicNames[2]!, 2)
    const recommendationIntent = {
      route: 'my.import.topics.recommendation',
      topic_title: input.name,
      topic_slug: input.slug,
      markdown: `Imported topic: ${input.name}`,
    }
    const claim = await claimContributionAdmission(
      administrator.id,
      stableTopicImportIdempotencyKey(administrator.id, importAttemptId, input.slug),
      recommendationIntent,
      {
        route: 'my.import.topics.recommendation',
        scope: 'my.import.topics',
        source: 'topic_recommendation',
        postType: 'topic_recommendation',
        policyRevision: 'capacity-exempt',
      },
    )
    if (claim.kind !== 'claimed') throw new Error('Expected to seed an active import claim')

    const request = createRequest()
    await request.authenticateAs(administrator)
    const inProgress = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', importAttemptId)
      .send({ names: topicNames })
      .expect(409)

    const retryAfterSeconds = Number(inProgress.headers['retry-after'])
    expect(retryAfterSeconds).toBeGreaterThanOrEqual(1)
    expect(retryAfterSeconds).toBeLessThanOrEqual(30)
    expect(inProgress.body.code).toBe('CONTRIBUTION_ADMISSION_IN_PROGRESS')
    await expect(
      getTopicImportRequestForTest(administrator.id, existingTopic.id),
    ).resolves.toBeNull()

    await discardRejectedContributionAdmission(claim.reservationId, claim.leaseId)
    const owner = await admitImportedTopicRecommendation(
      administrator,
      input,
      null,
      importAttemptId,
    )
    if (owner.kind !== 'created') throw new Error('Expected the import owner to settle')

    const replay = await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .set('Idempotency-Key', importAttemptId)
      .send({ names: topicNames })
      .expect(200)

    expect(replay.body.results).toHaveLength(3)
    expect(replay.body.results[0]).toMatchObject({
      input: existingTopic.name,
      status: 'followed',
      entity_id: existingTopic.id,
    })
    expect(replay.body.results[1]).toMatchObject({
      input: topicNames[1],
      status: 'recommendation_created',
      recommendation_post_id: expect.any(String),
    })
    expect(replay.body.results[2]).toEqual({
      input: topicNames[2],
      status: 'recommendation_created',
      recommendation_post_id: owner.response.id,
    })
    const firstRecommendationPostId = replay.body.results[1].recommendation_post_id
    await expect(
      getTopicImportRequestCountByRecommendationForTest(administrator.id, owner.response.id),
    ).resolves.toBe(1)
    await expect(
      getTopicImportRequestCountByRecommendationForTest(
        administrator.id,
        firstRecommendationPostId,
      ),
    ).resolves.toBe(1)
    await expect(
      getTopicImportRequestForTest(administrator.id, existingTopic.id),
    ).resolves.toMatchObject({
      input_value: existingTopic.name,
      topic_id: existingTopic.id,
    })
  })

  it('rejects a topic import body larger than 2 MiB', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/import/topics')
      .set('Content-Type', 'application/json')
      .send({ names: ['x'.repeat(2 * 1024 * 1024)] })
      .expect(413)
  })
})

describe('GET /api/v1/my/export/rss-feeds', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/export/rss-feeds').expect(401)
  })

  it('returns OPML by default', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/export/rss-feeds').expect(200)

    expect(response.headers['content-type']).toContain('xml')
    expect(response.text).toContain('<opml')
  })

  it('returns JSON when format=json', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/export/rss-feeds?format=json').expect(200)

    expect(response.headers['content-type']).toContain('application/json')
    expect(Array.isArray(response.body.results)).toBe(true)
  })

  it('returns filtered results when feed_type=article', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/export/rss-feeds?feed_type=article').expect(200)

    expect(response.headers['content-type']).toContain('xml')
    expect(response.text).toContain('<opml')
  })

  it('preflights an RSS feed export without generating a response body', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/export/rss-feeds?preflight=1').expect(204)

    expect(response.text).toBe('')
  })
})

describe('GET /api/v1/my/export/topics', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/export/topics').expect(401)
  })

  it('returns JSON with results array', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/export/topics').expect(200)

    expect(response.headers['content-type']).toContain('application/json')
    expect(Array.isArray(response.body.results)).toBe(true)
  })

  it('downloads the established top-level topics array artifact', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get('/api/v1/my/export/topics?download=1').expect(200)

    expect(response.headers['content-disposition']).toContain('topics.json')
    expect(Array.isArray(response.body)).toBe(true)
  })

  it('preflights a topic export without generating a response body', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .get('/api/v1/my/export/topics?download=1&preflight=1')
      .expect(204)

    expect(response.text).toBe('')
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getRssFeedImportFollowForTest)
  void (0 as unknown as typeof getRssFeedImport)
})
