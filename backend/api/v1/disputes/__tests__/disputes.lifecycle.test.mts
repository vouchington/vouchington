import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from '@services/review-disputes/parse'
import { createReviewDispute } from '@services/review-disputes/create'
import { updateReviewDisputeDraft } from '@services/review-disputes/update-dispute-draft'

function expectEnrichedStaffContext(dispute: Record<string, unknown>): void {
  expect(dispute).toMatchObject({
    staff_context: {
      disputant: {
        id: expect.any(String),
        verified_display_name: null,
        profile_image_id: null,
      },
      review: {
        post: { id: expect.any(String), slug: expect.any(String) },
        topic: { id: expect.any(String), slug: expect.any(String), topic_type: expect.any(String) },
        rating: expect.any(Number),
      },
    },
  })
}

describe('POST /api/v1/disputes — create', () => {
  let staffUser: PrivateUser
  let topicId: string
  let reviewPostId: string
  let claimant: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    const creator = await createTestUser()
    claimant = await createTestUser()
    topicId = await insertTestTopic({
      name: `Create API Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `create-api-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staffUser.id, claim.id)
    const reviewer = await createTestUser()
    reviewPostId = await insertTestPost({
      title: `Create API Review ${crypto.randomUUID().slice(0, 8)}`,
      slug: `create-api-review-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'The product has serious flaws.',
      postType: 'review',
    })
    await insertTestPostReview(reviewPostId, topicId, 1)
  })

  it('returns 401 for unauthenticated requests', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/disputes')
      .set('Content-Type', 'application/json')
      .send({ post_id: reviewPostId, reason: 'factually_inaccurate', claim_text: 'x' })
      .expect(401)
  })

  it('returns 403 when user has no verified claim', async () => {
    const noClaimUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(noClaimUser)
    await request
      .post('/api/v1/disputes')
      .set('Content-Type', 'application/json')
      .send({ post_id: reviewPostId, reason: 'factually_inaccurate', claim_text: 'test' })
      .expect(403)
  })

  it('creates a dispute and returns 201', async () => {
    const request = createRequest()
    await request.authenticateAs(claimant)
    const response = await request
      .post('/api/v1/disputes')
      .set('Content-Type', 'application/json')
      .send({
        post_id: reviewPostId,
        reason: 'factually_inaccurate',
        claim_text: `Lifecycle test ${crypto.randomUUID()}`,
      })
      .expect(res => expect([200, 201]).toContain(res.status))

    expect(response.body.dispute).toBeDefined()
    expect(response.body.dispute.post_id).toBe(reviewPostId)
    expect(response.body.dispute.status).toBe('pending')
  })
})

describe('GET /api/v1/disputes/:id', () => {
  let regularUser: PrivateUser

  beforeAll(async () => {
    regularUser = await createTestUser()
  })

  it('returns 401 for unauthenticated', async () => {
    const request = createRequest()
    await request.get(`/api/v1/disputes/${crypto.randomUUID()}`).expect(401)
  })

  it('returns 422 for non-UUID id', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get('/api/v1/disputes/not-a-uuid').expect(422)
  })

  it('returns 404 for unknown dispute id', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(`/api/v1/disputes/${crypto.randomUUID()}`).expect(404)
  })
})

describe('PATCH /api/v1/disputes/:id — staff draft edit', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser
  let disputeId: string

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const creator = await createTestUser()
    const claimant2 = await createTestUser()
    const topicId2 = await insertTestTopic({
      name: `Patch API Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `patch-api-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant2.id, {
      topicId: topicId2,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staffUser.id, claim.id)
    const reviewer = await createTestUser()
    const postId = await insertTestPost({
      title: `Patch API Review ${crypto.randomUUID().slice(0, 8)}`,
      slug: `patch-api-review-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'Review needing edit.',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId2, 2)
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'other',
      claim_text: 'Patch test dispute.',
    })
    const { dispute } = await createReviewDispute(claimant2, input)
    disputeId = dispute.id
  })

  it('returns 403 for non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .patch(`/api/v1/disputes/${disputeId}`)
      .set('Content-Type', 'application/json')
      .send({ public_response: 'hello' })
      .expect(403)
  })

  it('staff can edit the draft and response is updated', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request
      .patch(`/api/v1/disputes/${disputeId}`)
      .set('Content-Type', 'application/json')
      .send({ public_response: 'Staff response text', internal_notes: 'Private note' })
      .expect(200)

    expect(response.body.dispute.public_response).toBe('Staff response text')
    expectEnrichedStaffContext(response.body.dispute)
  })

  it('returns 404 for unknown dispute', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    await request
      .patch(`/api/v1/disputes/${crypto.randomUUID()}`)
      .set('Content-Type', 'application/json')
      .send({ public_response: 'x' })
      .expect(404)
  })
})

describe('POST /api/v1/disputes/:id/approval and /delivery', () => {
  let staffUser: PrivateUser
  let disputeId: string

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    const creator = await createTestUser()
    const claimant3 = await createTestUser()
    const topicId3 = await insertTestTopic({
      name: `Approval API Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `approval-api-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant3.id, {
      topicId: topicId3,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staffUser.id, claim.id)
    const reviewer = await createTestUser()
    const postId = await insertTestPost({
      title: `Approval API Review ${crypto.randomUUID().slice(0, 8)}`,
      slug: `approval-api-review-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'Review for approval test.',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId3, 2)
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'other',
      claim_text: 'Approval test dispute.',
    })
    const { dispute } = await createReviewDispute(claimant3, input)
    disputeId = dispute.id
    // Set the public response via service so approval works
    await updateReviewDisputeDraft(staffUser.id, disputeId, {
      publicResponse: 'Approved response text',
    })
  })

  it('delivery without approval returns 422 (legal invariant)', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    // Must fail because no approval yet on this fresh dispute
    await request.post(`/api/v1/disputes/${disputeId}/delivery`).expect(422)
  })

  it('approval succeeds and delivery succeeds after approval', async () => {
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staffUser)

    const approveResponse = await staffRequest
      .post(`/api/v1/disputes/${disputeId}/approval`)
      .expect(200)
    expect(approveResponse.body.dispute.approved_at).not.toBeNull()
    expectEnrichedStaffContext(approveResponse.body.dispute)

    const deliveryResponse = await staffRequest
      .post(`/api/v1/disputes/${disputeId}/delivery`)
      .expect(200)
    expect(deliveryResponse.body.dispute.sent_at).not.toBeNull()
    expectEnrichedStaffContext(deliveryResponse.body.dispute)
  })
})
