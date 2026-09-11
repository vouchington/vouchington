import {
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { adminVerifyTopicClaim } from '@services/topic-claims/admin-verify'
import { createTopicClaim } from '@services/topic-claims/create'
import { createReviewDisputeResolvedNotification } from '@services/notifications/create-review-dispute-resolved-notification'
import { listNotifications } from '@services/notifications/list'
import { describe, expect, it } from 'vitest'
import { createReviewDispute } from './create.mts'
import { parseCreateReviewDisputeInput } from './parse.mts'

describe('createReviewDisputeResolvedNotification', () => {
  it('creates one notification linked to the review dispute', async () => {
    const { claimant, disputeId } = await createReviewDisputeFixture()

    await createReviewDisputeResolvedNotification(
      claimant.id,
      disputeId,
      'The disputed review has been resolved.',
    )

    const notifications = await listNotifications(claimant.id)
    const notification = Object.values(notifications.notifications).find(
      item => item.review_dispute_id === disputeId,
    )
    expect(notification).toEqual(
      expect.objectContaining({
        entity_type: 'review_dispute',
        review_dispute_id: disputeId,
        title: 'Your review dispute has been resolved',
        body: 'The disputed review has been resolved.',
        target_path: '/my/disputes',
      }),
    )
  })

  async function createReviewDisputeFixture() {
    const staff = await createTestUser()
    const claimant = await createTestUser()
    const topicCreator = await createTestUser()
    const reviewer = await createTestUser()
    const suffix = crypto.randomUUID().slice(0, 8)
    const topicId = await insertTestTopic({
      name: `Notification Dispute ${suffix}`,
      slug: `notification-dispute-${suffix}`,
      createdById: topicCreator.id,
    })
    const { claim } = await createTopicClaim(claimant.id, {
      topicId,
      claimedRole: 'Issuer',
      evidence: '',
    })
    await adminVerifyTopicClaim(staff.id, claim.id)

    const postId = await insertTestPost({
      title: `Notification Dispute Post ${suffix}`,
      slug: `notification-dispute-post-${suffix}`,
      createdById: reviewer.id,
      markdown: 'Review body',
      postType: 'review',
    })
    await insertTestPostReview(postId, topicId, 3)
    const input = parseCreateReviewDisputeInput({
      post_id: postId,
      reason: 'other',
      claim_text: `Notification dispute ${suffix}`,
    })
    const { dispute } = await createReviewDispute(claimant, input)
    return { claimant, disputeId: dispute.id }
  }
})
