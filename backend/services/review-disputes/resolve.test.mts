import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
  getPostClearanceStatus,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { parseCreateReviewDisputeInput } from './parse.mts'
import { createReviewDispute } from './create.mts'
import {
  resolveReviewDisputeRemove,
  resolveReviewDisputeAnnotate,
  dismissReviewDispute,
} from './resolve.mts'
import { getActiveAnnotationForPost } from './annotations.mts'

describe('resolve review disputes', () => {
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
      name: `Resolve Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `resolve-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)
  })

  async function makeReviewPost() {
    const postId = await insertTestPost({
      title: `Resolve Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `resolve-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewerId,
      markdown: 'Review body',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId, 3)
    return postId
  }

  async function openDispute(postId: string, suffix: string) {
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'other',
      claim_text: `Resolve test ${suffix}`,
    })
    const { dispute } = await createReviewDispute(claimant, input)
    return dispute
  }

  it('resolveReviewDisputeRemove sets status=resolved and resolution_action=remove', async () => {
    const postId = await makeReviewPost()
    const dispute = await openDispute(postId, crypto.randomUUID())
    const resolved = await resolveReviewDisputeRemove(staff.id, dispute.id)

    expect(resolved.status).toBe('resolved')
    expect(resolved.resolution_action).toBe('remove')
    expect(resolved.resolved_at).not.toBeNull()
    expect(resolved.resolved_by_id).toBe(staff.id)
    // The disputed review must actually be taken down (clearance rejected)
    expect(await getPostClearanceStatus(postId)).toBe('rejected')
  })

  it('resolveReviewDisputeAnnotate creates an annotation and sets status=resolved', async () => {
    const postId = await makeReviewPost()
    const dispute = await openDispute(postId, crypto.randomUUID())
    const resolved = await resolveReviewDisputeAnnotate(
      staff.id,
      dispute.id,
      'The reviewer mischaracterized our fee structure.',
    )

    expect(resolved.status).toBe('resolved')
    expect(resolved.resolution_action).toBe('annotate')

    const annotation = await getActiveAnnotationForPost(postId)
    expect(annotation).not.toBeNull()
    expect(annotation!.review_dispute_id).toBe(dispute.id)
  })

  it('dismissReviewDispute sets status=dismissed', async () => {
    const postId = await makeReviewPost()
    const dispute = await openDispute(postId, crypto.randomUUID())
    const dismissed = await dismissReviewDispute(staff.id, dispute.id)

    expect(dismissed.status).toBe('dismissed')
    expect(dismissed.resolution_action).toBe('dismiss')
  })

  it('throws 404 when resolving an already resolved dispute', async () => {
    const postId = await makeReviewPost()
    const dispute = await openDispute(postId, crypto.randomUUID())
    await dismissReviewDispute(staff.id, dispute.id)

    await expect(dismissReviewDispute(staff.id, dispute.id)).rejects.toMatchObject({ status: 404 })
  })
})
