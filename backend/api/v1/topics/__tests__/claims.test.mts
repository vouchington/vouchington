import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'

describe('POST /api/v1/topics/:idOrSlug/claims', () => {
  let regularUser: PrivateUser
  let topicSlug: string
  let topicId: string

  beforeAll(async () => {
    regularUser = await createTestUser()
    const creator = await createTestUser()
    topicSlug = `claims-api-topic-${crypto.randomUUID().slice(0, 8)}`
    topicId = await insertTestTopic({
      name: `Claims API Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: topicSlug,
      createdById: creator.id,
    })
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/topics/${topicSlug}/claims`)
      .set('Content-Type', 'application/json')
      .send({ claimed_role: 'Issuer', evidence: '' })
      .expect(401)
  })

  it('returns 415 without Content-Type json', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .post(`/api/v1/topics/${topicSlug}/claims`)
      .set('Content-Type', 'text/plain')
      .send('bad')
      .expect(415)
  })

  it('returns 422 when claimed_role is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .post(`/api/v1/topics/${topicSlug}/claims`)
      .set('Content-Type', 'application/json')
      .send({ evidence: 'no role here' })
      .expect(422)
  })

  it('creates a claim (201) for authenticated user', async () => {
    const claimant = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(claimant)
    const response = await request
      .post(`/api/v1/topics/${topicId}/claims`)
      .set('Content-Type', 'application/json')
      .send({ claimed_role: 'Issuer', evidence: 'I own this topic.' })
      .expect(201)

    expect(response.body.claim).toBeDefined()
    expect(response.body.claim.topic_id).toBe(topicId)
    expect(response.body.isDuplicate).toBe(false)
  })

  it('returns 200 isDuplicate true on second submission', async () => {
    const dupUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(dupUser)

    await request
      .post(`/api/v1/topics/${topicId}/claims`)
      .set('Content-Type', 'application/json')
      .send({ claimed_role: 'Operator', evidence: 'First.' })
      .expect(201)

    const second = await request
      .post(`/api/v1/topics/${topicId}/claims`)
      .set('Content-Type', 'application/json')
      .send({ claimed_role: 'Operator', evidence: 'Updated.' })
      .expect(200)

    expect(second.body.isDuplicate).toBe(true)
  })
})

describe('GET /api/v1/topics/:idOrSlug/claims', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser
  let topicSlug: string
  let topicId: string
  let claimant: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicSlug = `claims-list-topic-${crypto.randomUUID().slice(0, 8)}`
    topicId = await insertTestTopic({
      name: `Claims List Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: topicSlug,
      createdById: creator.id,
    })
    await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get(`/api/v1/topics/${topicSlug}/claims`).expect(401)
  })

  it('returns 404 for unknown topic', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/topics/nonexistent-topic-slug-xyz/claims').expect(404)
  })

  it('staff sees all claims', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request.get(`/api/v1/topics/${topicSlug}/claims`).expect(200)
    expect(Array.isArray(response.body.claims)).toBe(true)
    expect(response.body.claims.length).toBeGreaterThan(0)
    // Each claim has a state field
    expect(response.body.claims[0].state).toBeDefined()
  })

  it('non-staff sees only own claims', async () => {
    const otherUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(otherUser)
    const response = await request.get(`/api/v1/topics/${topicSlug}/claims`).expect(200)
    // Other user has no claims on this topic
    expect(response.body.claims).toEqual([])
  })

  it('claimant sees their own claim', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)
    const response = await request.get(`/api/v1/topics/${topicSlug}/claims`).expect(200)
    expect(response.body.claims.length).toBe(1)
    expect(response.body.claims[0].claimant_user_id).toBe(claimant.id)
  })
})
