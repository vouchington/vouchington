import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from './parse.mts'
import { createReviewDispute } from './create.mts'
import { createReviewDisputeDraft } from './create-dispute-draft.mts'
import { approveReviewDispute } from './approve-dispute.mts'
import { sendApprovedReviewDisputeResolution } from './send-dispute-resolution.mts'
import { getReviewDisputeByIdFromPrimary } from './get.mts'

describe('review dispute lifecycle - send-requires-approval invariant', () => {
  let staff: PrivateUser
  let claimant: PrivateUser
  let topicId: string
  let reviewerId: string

  beforeAll(async () => {
    staff = await createTestUser()
    claimant = await createTestUser()
    const creator = await createTestUser()
    const reviewer = await createTestUser()
    reviewerId = reviewer.id
    topicId = await insertTestTopic({
      name: `Lifecycle Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `lifecycle-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)
  })

  async function makePost() {
    const postId = await insertTestPost({
      title: `Lifecycle Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `lifecycle-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewerId,
      markdown: 'Review body',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId, 1)
    return postId
  }

  async function makeDispute(postId: string, suffix: string) {
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'factually_inaccurate',
      claim_text: `Lifecycle test ${suffix}`,
    })
    const { dispute } = await createReviewDispute(claimant, input)
    return dispute
  }

  it('throws 422 when attempting to send without approval (legally required invariant)', async () => {
    const postId = await makePost()
    const dispute = await makeDispute(postId, crypto.randomUUID())

    await createReviewDisputeDraft({
      disputeId: dispute.id,
      recommendedAction: 'no_action',
      aiPublicResponse: 'AI response here.',
      aiInternalResponse: 'Internal notes.',
      model: 'test-model',
    })

    await expect(sendApprovedReviewDisputeResolution(staff.id, dispute.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('allows sending after approval', async () => {
    const postId = await makePost()
    const dispute = await makeDispute(postId, crypto.randomUUID())

    await createReviewDisputeDraft({
      disputeId: dispute.id,
      recommendedAction: 'no_action',
      aiPublicResponse: 'We reviewed your dispute.',
      aiInternalResponse: 'No violation found.',
      model: 'test-model',
    })
    await approveReviewDispute(staff.id, dispute.id)
    const sent = await sendApprovedReviewDisputeResolution(staff.id, dispute.id)

    expect(sent.sent_at).not.toBeNull()
  })

  it('does not let a completed AI rerun overwrite an approved response', async () => {
    const postId = await makePost()
    const dispute = await makeDispute(postId, crypto.randomUUID())
    await createReviewDisputeDraft({
      disputeId: dispute.id,
      recommendedAction: 'no_action',
      aiPublicResponse: 'Approved response.',
      aiInternalResponse: 'Approved internal notes.',
      model: 'test-model',
    })
    const approved = await approveReviewDispute(staff.id, dispute.id)

    await expect(
      createReviewDisputeDraft({
        disputeId: dispute.id,
        recommendedAction: 'remove',
        aiPublicResponse: 'Late rerun response.',
        aiInternalResponse: 'Late rerun internal notes.',
        model: 'test-model-rerun',
      }),
    ).rejects.toMatchObject({ status: 404 })

    const unchanged = await getReviewDisputeByIdFromPrimary(dispute.id)
    expect(unchanged!.public_response).toBe('Approved response.')
    expect(unchanged!.ai_public_response).toBe('Approved response.')
    expect(unchanged!.approved_at).toEqual(approved.approved_at)
  })

  it('throws 422 when attempting to send a dispute twice', async () => {
    const postId = await makePost()
    const dispute = await makeDispute(postId, crypto.randomUUID())
    await createReviewDisputeDraft({
      disputeId: dispute.id,
      recommendedAction: 'no_action',
      aiPublicResponse: 'Response.',
      aiInternalResponse: 'Internal.',
      model: 'test-model',
    })
    await approveReviewDispute(staff.id, dispute.id)
    await sendApprovedReviewDisputeResolution(staff.id, dispute.id)

    await expect(sendApprovedReviewDisputeResolution(staff.id, dispute.id)).rejects.toMatchObject({
      status: 422,
    })
  })
})
