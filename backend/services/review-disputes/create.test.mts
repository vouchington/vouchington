import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestTopic,
  insertTestPost,
  insertTestPostReview,
  updateTestPostReviewRating,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createTopicClaim } from '@services/topic-claims/create'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { revokeTopicClaim } from '@services/topic-claims/revoke'
import { createReviewDispute } from './create.mts'
import { parseCreateReviewDisputeInput } from './parse.mts'
import { getReviewDisputeById } from './get.mts'

async function makeVerifiedClaimant(topicId: string, staffId: string) {
  const claimant = await createTestUser()
  const { claim } = await createTopicClaim(claimant.id, {
    topicId,
    claimedRole: 'Issuer',
    evidence: '',
  })
  await adminVerifyTopicClaim(staffId, claim.id)
  return { claimant, claim }
}

async function makeReviewPost(authorId: string, topicId: string, title?: string): Promise<string> {
  const postId = await insertTestPost({
    title: title ?? `RD Review ${crypto.randomUUID().slice(0, 8)}`,
    slug: `rd-review-${crypto.randomUUID().slice(0, 8)}`,
    createdById: authorId,
    markdown: 'This topic gets 2 stars.',
    postType: 'review',
  })
  await insertTestPostReview(postId, topicId, 2)
  return postId
}

describe('createReviewDispute', () => {
  let staff: PrivateUser
  let topicId: string
  let reviewer: PrivateUser
  let postId: string

  beforeAll(async () => {
    staff = await createTestUser()
    const creator = await createTestUser()
    topicId = await insertTestTopic({
      name: `RD Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `rd-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator.id,
    })
    reviewer = await createTestUser()
    postId = await makeReviewPost(reviewer.id, topicId)
  })

  it('creates a dispute when claimant has a verified claim', async () => {
    const { claimant } = await makeVerifiedClaimant(topicId, staff.id)
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'factually_inaccurate',
      claim_text: 'This review contains false information about our product.',
    })
    const { dispute, isDuplicate } = await createReviewDispute(claimant, input)

    expect(isDuplicate).toBe(false)
    expect(dispute.post_id).toBe(postId)
    expect(dispute.topic_id).toBe(topicId)
    expect(dispute.status).toBe('pending')
    expect(dispute.disputant_user_id).toBe(claimant.id)
    expect(dispute.post_content).toMatchObject({
      text: expect.any(String),
      declared_language: null,
      lingua_rs_detected_language: null,
    })
  })

  it('returns isDuplicate true on duplicate pending dispute', async () => {
    const { claimant } = await makeVerifiedClaimant(topicId, staff.id)
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'defamatory',
      claim_text: 'Initial claim.',
    })
    await createReviewDispute(claimant, input)
    const { dispute, isDuplicate } = await createReviewDispute(claimant, {
      ...input,
      claimText: 'Updated claim.',
    })
    expect(isDuplicate).toBe(true)
    expect(dispute.post_content).toMatchObject({ text: expect.any(String) })
  })

  it('keeps the original snapshot when a same-topic duplicate follows a live rating change', async () => {
    const { claimant } = await makeVerifiedClaimant(topicId, staff.id)
    const dedicatedPostId = await makeReviewPost(reviewer.id, topicId)
    const input = parseCreateReviewDisputeInput({
      post_id: dedicatedPostId,
      topic_id: topicId,
      reason: 'defamatory',
      claim_text: 'Initial claim.',
    })
    const first = await createReviewDispute(claimant, input)

    await updateTestPostReviewRating(dedicatedPostId, topicId, 5)
    const duplicate = await createReviewDispute(claimant, {
      ...input,
      claimText: 'Updated evidence for the same disputed rating.',
    })

    expect(duplicate.isDuplicate).toBe(true)
    expect(duplicate.dispute.id).toBe(first.dispute.id)
    expect(duplicate.dispute.claim_text).toBe('Updated evidence for the same disputed rating.')
    const found = await getReviewDisputeById(first.dispute.id)
    expect(found?.staff_context?.review.rating).toBe(2)
  })

  it('throws 403 when claimant has no verified claim', async () => {
    const unverified = await createTestUser()
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'other',
      claim_text: 'I claim this.',
    })
    await expect(createReviewDispute(unverified, input)).rejects.toMatchObject({ status: 403 })
  })

  it('throws 403 when claim is revoked', async () => {
    const { claimant, claim } = await makeVerifiedClaimant(topicId, staff.id)
    await revokeTopicClaim(staff.id, claim.id, 'Ownership lost')
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'other',
      claim_text: 'Revoked.',
    })
    await expect(createReviewDispute(claimant, input)).rejects.toMatchObject({ status: 403 })
  })

  it('throws 422 when post is not a review', async () => {
    const { claimant } = await makeVerifiedClaimant(topicId, staff.id)
    const discussionId = await insertTestPost({
      title: `Not a Review ${crypto.randomUUID().slice(0, 8)}`,
      slug: `not-review-${crypto.randomUUID().slice(0, 8)}`,
      createdById: reviewer.id,
      markdown: 'Discussion post',
      postType: 'discussion',
    })
    const input = parseCreateReviewDisputeInput({
      post_id: discussionId,
      reason: 'other',
      claim_text: 'Trying to dispute a non-review.',
    })
    await expect(createReviewDispute(claimant, input)).rejects.toMatchObject({ status: 422 })
  })

  it('uses the specified topic_id for multi-topic reviews', async () => {
    // Create a second topic and add it as a second rating to the post
    const creator2 = await createTestUser()
    const topicId2 = await insertTestTopic({
      name: `RD Topic2 ${crypto.randomUUID().slice(0, 8)}`,
      slug: `rd-topic2-${crypto.randomUUID().slice(0, 8)}`,
      createdById: creator2.id,
    })
    await insertTestPostReview(postId, topicId2, 3)
    const { claimant } = await makeVerifiedClaimant(topicId2, staff.id)
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      topic_id: topicId2,
      reason: 'factually_inaccurate',
      claim_text: 'This review about our product is wrong.',
    })
    const { dispute } = await createReviewDispute(claimant, input)
    expect(dispute.topic_id).toBe(topicId2)
  })

  it('creates separate disputes when the same claimant disputes two topics on one review', async () => {
    const secondTopicCreator = await createTestUser()
    const secondTopicId = await insertTestTopic({
      name: `RD Cross Topic ${crypto.randomUUID().slice(0, 8)}`,
      slug: `rd-cross-topic-${crypto.randomUUID().slice(0, 8)}`,
      createdById: secondTopicCreator.id,
    })
    const dedicatedPostId = await makeReviewPost(reviewer.id, topicId)
    await insertTestPostReview(dedicatedPostId, secondTopicId, 4)
    const { claimant } = await makeVerifiedClaimant(topicId, staff.id)
    const { claim: secondClaim } = await createTopicClaim(claimant.id, {
      topicId: secondTopicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, secondClaim.id)

    const first = await createReviewDispute(
      claimant,
      parseCreateReviewDisputeInput({
        post_id: dedicatedPostId,
        topic_id: topicId,
        reason: 'defamatory',
        claim_text: 'Evidence for topic A.',
      }),
    )
    const second = await createReviewDispute(
      claimant,
      parseCreateReviewDisputeInput({
        post_id: dedicatedPostId,
        topic_id: secondTopicId,
        reason: 'privacy_violation',
        claim_text: 'Different evidence for topic B.',
      }),
    )

    expect(first.isDuplicate).toBe(false)
    expect(second.isDuplicate).toBe(false)
    expect(second.dispute.id).not.toBe(first.dispute.id)
    expect(first.dispute.topic_id).toBe(topicId)
    expect(second.dispute.topic_id).toBe(secondTopicId)
    expect(first.dispute.claim_text).toBe('Evidence for topic A.')
    expect(second.dispute.claim_text).toBe('Different evidence for topic B.')
  })
})
