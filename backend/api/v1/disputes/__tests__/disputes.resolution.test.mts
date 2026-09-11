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
import { approveReviewDispute } from '@services/review-disputes/approve-dispute'
import type { ReviewDispute } from '@services/review-disputes'

async function makeDisputeFixture(staffId: string) {
  const creator = await createTestUser()
  const claimant = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Resolution Topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: `resolution-topic-${crypto.randomUUID().slice(0, 8)}`,
    createdById: creator.id,
  })
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staffId, claim.id)
  const reviewer = await createTestUser()
  const postId = await insertTestPost({
    title: `Resolution Review ${crypto.randomUUID().slice(0, 8)}`,
    slug: `resolution-review-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'Review for resolution test.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 1)
  const input = parseCreateReviewDisputeInput({
    post_id: postId,
    reason: 'defamatory',
    claim_text: `Resolution test ${crypto.randomUUID()}`,
  })
  const { dispute } = await createReviewDispute(claimant, input)
  return { dispute, postId }
}

function expectEnrichedStaffContext(dispute: Record<string, unknown>): void {
  expect(dispute).toMatchObject({
    staff_context: {
      disputant: {
        id: expect.any(String),
        username: expect.any(String),
        verified_display_name: null,
        profile_image_id: null,
      },
      review: {
        post: {
          id: expect.any(String),
          title: expect.any(String),
          slug: expect.any(String),
          markdown_preview: expect.any(String),
          created_by_id: expect.any(String),
          created_at: expect.any(String),
        },
        topic: {
          id: expect.any(String),
          name: expect.any(String),
          slug: expect.any(String),
          topic_type: expect.any(String),
        },
        rating: expect.any(Number),
      },
    },
  })
}

describe('POST /api/v1/disputes/:id/resolution', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 403 for non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .post(`/api/v1/disputes/${crypto.randomUUID()}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'dismiss' })
      .expect(403)
  })

  it('returns 422 for invalid action', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const { dispute } = await makeDisputeFixture(staffUser.id)
    await request
      .post(`/api/v1/disputes/${dispute.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'invalid_action' })
      .expect(422)
  })

  it('dismiss action resolves the dispute', async () => {
    const { dispute } = await makeDisputeFixture(staffUser.id)
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request
      .post(`/api/v1/disputes/${dispute.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'dismiss' })
      .expect(200)

    expect(response.body.dispute.status).toBe('dismissed')
    expect(response.body.dispute.resolution_action).toBe('dismiss')
    expectEnrichedStaffContext(response.body.dispute)
  })

  it('remove action resolves the dispute', async () => {
    const { dispute } = await makeDisputeFixture(staffUser.id)
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request
      .post(`/api/v1/disputes/${dispute.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'remove' })
      .expect(200)

    expect(response.body.dispute.status).toBe('resolved')
    expect(response.body.dispute.resolution_action).toBe('remove')
    expectEnrichedStaffContext(response.body.dispute)
  })

  it('annotate requires body_text and returns 422 without it', async () => {
    const { dispute } = await makeDisputeFixture(staffUser.id)
    const request = createRequest()
    await request.authenticateAs(staffUser)
    await request
      .post(`/api/v1/disputes/${dispute.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'annotate' })
      .expect(422)
  })

  it('annotate action resolves the dispute with an annotation', async () => {
    const { dispute } = await makeDisputeFixture(staffUser.id)
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request
      .post(`/api/v1/disputes/${dispute.id}/resolution`)
      .set('Content-Type', 'application/json')
      .send({ action: 'annotate', body_text: 'Context annotation for reviewer.' })
      .expect(200)

    expect(response.body.dispute.status).toBe('resolved')
    expect(response.body.dispute.resolution_action).toBe('annotate')
    expectEnrichedStaffContext(response.body.dispute)
  })

  it('returns 415 without Content-Type json', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const { dispute } = await makeDisputeFixture(staffUser.id)
    await request
      .post(`/api/v1/disputes/${dispute.id}/resolution`)
      .set('Content-Type', 'text/plain')
      .send('invalid')
      .expect(415)
  })
})

describe('GET /api/v1/disputes/:id — tiered view', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser
  let dispute: ReviewDispute

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    const fixture = await makeDisputeFixture(staffUser.id)
    dispute = fixture.dispute
  })

  it('staff sees private fields', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    const response = await request.get(`/api/v1/disputes/${dispute.id}`).expect(200)
    expect(response.body.dispute.disputant_user_id).toBeDefined()
    expect(response.body.dispute.claim_text).toBeDefined()
    expect(response.body.dispute.post_content).toMatchObject({
      text: expect.any(String),
      declared_language: null,
      lingua_rs_detected_language: null,
    })
    expectEnrichedStaffContext(response.body.dispute)
  })

  it('member sees redacted dispute (no private fields)', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    const response = await request.get(`/api/v1/disputes/${dispute.id}`).expect(200)
    expect(response.body.dispute.disputant_user_id).toBeUndefined()
    expect(response.body.dispute.claim_text).toBeUndefined()
    expect(response.body.dispute.staff_context).toBeUndefined()
    expect(response.body.dispute.post_content).toMatchObject({ text: expect.any(String) })
    const rawMemberJson = JSON.stringify(response.body)
    expect(rawMemberJson).not.toContain('"staff_context"')
    expect(rawMemberJson).not.toContain('"disputant"')
    expect(rawMemberJson).not.toContain('"review"')
  })
})

describe('POST /api/v1/disputes/:id/resolution-drafts — staff rerun', () => {
  let staffUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    staffUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 403 for non-staff', async () => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.post(`/api/v1/disputes/${crypto.randomUUID()}/resolution-drafts`).expect(403)
  })

  it('returns 404 for unknown dispute', async () => {
    const request = createRequest()
    await request.authenticateAs(staffUser)
    await request.post(`/api/v1/disputes/${crypto.randomUUID()}/resolution-drafts`).expect(404)
  })

  it('rejects an approved pending dispute before enqueueing a rerun', async () => {
    const { dispute } = await makeDisputeFixture(staffUser.id)
    await updateReviewDisputeDraft(staffUser.id, dispute.id, {
      publicResponse: 'Approved response.',
    })
    await approveReviewDispute(staffUser.id, dispute.id)
    const request = createRequest()
    await request.authenticateAs(staffUser)

    await request.post(`/api/v1/disputes/${dispute.id}/resolution-drafts`).expect(422)
  })
})
