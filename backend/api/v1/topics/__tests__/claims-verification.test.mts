import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'

describe('POST /api/v1/topics/:idOrSlug/claims/:claimId/verification-token', () => {
  let claimant: PrivateUser
  let topicSlug: string
  let claimId: string

  beforeAll(async () => {
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicSlug = `vtoken-topic-${crypto.randomUUID().slice(0, 8)}`
    const topicId = await insertTestTopic({
      name: `VToken Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: topicSlug,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    claimId = claim.id
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/verification-token`)
      .expect(401)
  })

  it('returns 403 for non-claimant user', async () => {
    const other = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(other)
    await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/verification-token`)
      .expect(403)
  })

  it('returns 422 for claim id not a UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)
    await request
      .post(`/api/v1/topics/${topicSlug}/claims/not-a-uuid/verification-token`)
      .expect(422)
  })
})

describe('POST /api/v1/topics/:idOrSlug/claims/:claimId/manual-review-submission', () => {
  let claimant: PrivateUser
  let topicSlug: string
  let claimId: string

  beforeAll(async () => {
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicSlug = `manual-review-topic-${crypto.randomUUID().slice(0, 8)}`
    const topicId = await insertTestTopic({
      name: `Manual Review Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: topicSlug,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    claimId = claim.id
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/manual-review-submission`)
      .set('Content-Type', 'application/json')
      .send({ evidence: 'some evidence' })
      .expect(401)
  })

  it('returns 415 without json Content-Type', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)
    await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/manual-review-submission`)
      .set('Content-Type', 'text/plain')
      .send('bad')
      .expect(415)
  })

  it('returns 422 when evidence is empty', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)
    await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/manual-review-submission`)
      .set('Content-Type', 'application/json')
      .send({ evidence: '' })
      .expect(422)
  })

  it('submits for manual review with valid evidence', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)
    const response = await request
      .post(`/api/v1/topics/${topicSlug}/claims/${claimId}/manual-review-submission`)
      .set('Content-Type', 'application/json')
      .send({ evidence: 'I can prove ownership through business registration.' })
      .expect(200)

    expect(response.body.claim).toBeDefined()
    expect(response.body.claim.submitted_at).not.toBeNull()
  })
})
