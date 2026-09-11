import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { adminVerifyTopicClaim, createTopicClaim } from '@services/topic-claims'
import {
  approveReviewDispute,
  createReviewDispute,
  updateReviewDisputeDraft,
} from '@services/review-disputes'
import { parseCreateReviewDisputeInput } from '@services/review-disputes/parse'
import type { PrivateUser } from '@services/users/types'
import { runDisputeResolutionAgent } from './run.mts'

describe('runDisputeResolutionAgent terminal lifecycle', () => {
  let staff: PrivateUser
  let claimant: PrivateUser
  let topicId: string

  beforeAll(async () => {
    staff = await createTestUser()
    claimant = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `Terminal Dispute Topic ${randomUUID().slice(0, 8)}`,
      slug: `terminal-dispute-${randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)
  })

  it('does not bill a model call when a queued manual rerun reaches an approved dispute', async () => {
    const reviewer = await createTestUser()
    const postId = await insertTestPost({
      title: `Terminal Dispute Review ${randomUUID().slice(0, 8)}`,
      slug: `terminal-dispute-review-${randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'Review content for the terminal lifecycle test.',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId, 1)
    const { dispute } = await createReviewDispute(
      claimant,
      parseCreateReviewDisputeInput({
        post_id: postId,
        reason: 'factually_inaccurate',
        claim_text: `Terminal dispute claim ${randomUUID()}`,
      }),
    )
    await updateReviewDisputeDraft(staff.id, dispute.id, {
      publicResponse: 'Approved human response.',
    })
    await approveReviewDispute(staff.id, dispute.id)
    const callModel = vi.fn<(input: string, safetyId: string) => Promise<unknown>>()

    await runDisputeResolutionAgent({ disputeId: dispute.id, rerunById: staff.id }, callModel)

    expect(callModel).not.toHaveBeenCalled()
  })
})
