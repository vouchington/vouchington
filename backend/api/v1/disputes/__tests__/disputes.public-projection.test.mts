import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
} from '@voucha/test-helpers'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from '@services/review-disputes/parse'
import { createReviewDispute } from '@services/review-disputes/create'

async function makeDispute() {
  const staff = await createTestUser({ administrator: true })
  const creator = await createTestUser()
  const topicId = await insertTestTopic({
    name: `Public dispute topic ${crypto.randomUUID().slice(0, 8)}`,
    slug: `public-dispute-topic-${crypto.randomUUID().slice(0, 8)}`,
    createdById: creator.id,
  })
  const claimant = await createTestUser()
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staff.id, claim.id)
  const reviewer = await createTestUser()
  const postId = await insertTestPost({
    title: `Public dispute post ${crypto.randomUUID().slice(0, 8)}`,
    slug: `public-dispute-post-${crypto.randomUUID().slice(0, 8)}`,
    createdById: reviewer.id,
    markdown: 'A disputed review.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 1)
  const { dispute } = await createReviewDispute(
    claimant,
    parseCreateReviewDisputeInput({ post_id: postId, reason: 'other', claim_text: 'Disputed' }),
  )
  return { staff, claimant, dispute }
}

describe('dispute public projection routes', () => {
  it('serves the same dispute ID through real staff and member list and detail routes', async () => {
    const { staff, claimant, dispute } = await makeDispute()
    const staffRequest = createRequest()
    await staffRequest.authenticateAs(staff)
    const staffList = await staffRequest
      .get('/api/v1/disputes?status=pending&limit=100')
      .expect(200)
    const staffListDispute = staffList.body.disputes.find(
      (candidate: { id: string }) => candidate.id === dispute.id,
    )
    const staffDetail = await staffRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(claimant)
    const memberList = await memberRequest
      .get('/api/v1/disputes?status=pending&mine=true')
      .expect(200)
    const memberListDispute = memberList.body.disputes.find(
      (candidate: { id: string }) => candidate.id === dispute.id,
    )
    const memberDetail = await memberRequest.get(`/api/v1/disputes/${dispute.id}`).expect(200)

    expect(staffListDispute?.id).toBe(dispute.id)
    expect(staffDetail.body.dispute.id).toBe(dispute.id)
    expect(memberListDispute?.id).toBe(dispute.id)
    expect(memberDetail.body.dispute.id).toBe(dispute.id)
    expect(staffListDispute).toHaveProperty('claim_text')
    expect(staffDetail.body.dispute).toHaveProperty('staff_context')
    const privateFields = [
      'disputant_user_id',
      'claim_text',
      'recommended_action',
      'ai_public_response',
      'ai_internal_response',
      'ai_drafted_at',
      'model',
      'internal_notes',
      'drafted_at',
      'edited_at',
      'edited_by_id',
      'approved_by_id',
      'resolved_by_id',
      'latest_lifecycle_change_id',
      'staff_context',
    ]
    for (const memberDispute of [memberListDispute, memberDetail.body.dispute]) {
      expect(memberDispute).toBeDefined()
      for (const field of privateFields) expect(memberDispute).not.toHaveProperty(field)
    }
  })
})
