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
import { dismissPendingDisputesForDeletedReview } from './resolve.mts'
import { getReviewDisputeById } from './get.mts'

async function makeVerifiedClaimant(topicId: string, staffId: string) {
  const claimant = await createTestUser()
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staffId, claim.id)
  return claimant
}

describe('dismissPendingDisputesForDeletedReview', () => {
  let staff: PrivateUser
  let topicId: string

  beforeAll(async () => {
    staff = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `Dismiss Deleted Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `dismiss-deleted-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
  })

  it('dismisses pending disputes for a deleted review and returns count', async () => {
    const reviewer = await createTestUser()
    const postId = await insertTestPost({
      title: `Dismiss Deleted Review ${crypto.randomUUID().slice(0, 8)}`,
      slug: `dismiss-deleted-review-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'Review that will be deleted.',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId, 1)

    const claimant1 = await makeVerifiedClaimant(topicId, staff.id)
    const claimant2 = await makeVerifiedClaimant(topicId, staff.id)

    const input1 = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'other',
      claim_text: `Delete dismiss test 1 ${crypto.randomUUID()}`,
    })
    const input2 = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'factually_inaccurate',
      claim_text: `Delete dismiss test 2 ${crypto.randomUUID()}`,
    })
    const { dispute: d1 } = await createReviewDispute(claimant1, input1)
    const { dispute: d2 } = await createReviewDispute(claimant2, input2)

    const count = await dismissPendingDisputesForDeletedReview(postId)
    expect(count).toBeGreaterThanOrEqual(2)

    const after1 = await getReviewDisputeById(d1.id)
    const after2 = await getReviewDisputeById(d2.id)
    expect(after1!.status).toBe('dismissed')
    expect(after1!.resolution_action).toBe('dismiss')
    expect(after2!.status).toBe('dismissed')
  })

  it('returns 0 when no pending disputes exist for the post', async () => {
    const postId = crypto.randomUUID()
    const count = await dismissPendingDisputesForDeletedReview(postId)
    expect(count).toBe(0)
  })
})
