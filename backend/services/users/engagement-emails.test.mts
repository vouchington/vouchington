import { beforeAll, describe, expect, it } from 'vitest'
import {
  ageUnsentEngagementEmailClaimForTest,
  createTestUser,
  insertEntityRelation,
  insertTestReferralProgram,
  insertTestRssFeedDirect,
  insertTestTopic,
  insertTestUrlDirect,
} from '@voucha/test-helpers'
import { insertTestUserReferralProgramLink } from '@voucha/test-helpers/entities/referral-links'
import {
  claimEngagementEmailSend,
  isFollowNewsSourcesEmailStillEligible,
  isFollowTopicsEmailStillEligible,
  isPostReferralLinkEmailStillEligible,
  markEngagementEmailDeliveryAttempted,
  releaseUnsentEngagementEmailClaim,
} from './engagement-emails.mts'

describe('claimEngagementEmailSend', () => {
  let userId: string

  beforeAll(async () => {
    const user = await createTestUser()
    userId = user!.id
  })

  it('deduplicates by user and email type', async () => {
    await expect(claimEngagementEmailSend(userId, 'follow_topics')).resolves.toBe(true)
    await expect(claimEngagementEmailSend(userId, 'follow_topics')).resolves.toBe(false)
    await expect(claimEngagementEmailSend(userId, 'post_referral_link')).resolves.toBe(true)
  })

  it('releases unsent claims so failed enqueues can retry', async () => {
    const user = await createTestUser()

    await expect(claimEngagementEmailSend(user.id, 'follow_news_sources')).resolves.toBe(true)
    await expect(releaseUnsentEngagementEmailClaim(user.id, 'follow_news_sources')).resolves.toBe(
      true,
    )
    await expect(claimEngagementEmailSend(user.id, 'follow_news_sources')).resolves.toBe(true)
  })

  it('retries stale unsent claims without retrying fresh claims', async () => {
    const user = await createTestUser()

    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(true)
    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(false)
    await ageUnsentEngagementEmailClaimForTest(user.id, 'follow_topics')

    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(true)
  })

  it('does not retry stale claims after delivery was attempted', async () => {
    const user = await createTestUser()

    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(true)
    await expect(markEngagementEmailDeliveryAttempted(user.id, 'follow_topics')).resolves.toBe(true)
    await ageUnsentEngagementEmailClaimForTest(user.id, 'follow_topics')

    await expect(claimEngagementEmailSend(user.id, 'follow_topics')).resolves.toBe(false)
  })
})

describe('engagement email campaign eligibility', () => {
  it('detects users who followed topics after a follow-topics email was queued', async () => {
    const user = await createTestUser()
    const topicId = await insertTestTopic({
      name: `Queued Follow Topic ${user.id}`,
      slug: `queued-follow-topic-${user.id}`,
      createdById: user.id,
    })

    await expect(isFollowTopicsEmailStillEligible(user.id)).resolves.toBe(true)
    await insertEntityRelation('relation__user__follow__topic', user.id, topicId)

    await expect(isFollowTopicsEmailStillEligible(user.id)).resolves.toBe(false)
  })

  it('detects users who posted referral links after a referral email was queued', async () => {
    const user = await createTestUser()
    const referralProgramId = await insertTestReferralProgram({ createdById: user.id })
    const url = await insertTestUrlDirect(user.id, `https://queued-referral-${user.id}.example`)

    await expect(isPostReferralLinkEmailStillEligible(user.id)).resolves.toBe(true)
    await insertTestUserReferralProgramLink({
      userId: user.id,
      referralProgramId,
      urlId: url!.id,
    })

    await expect(isPostReferralLinkEmailStillEligible(user.id)).resolves.toBe(false)
  })

  it('detects users who followed news sources after a source email was queued', async () => {
    const user = await createTestUser()
    const feed = await insertTestRssFeedDirect({
      title: `Queued Source Feed ${user.id}`,
    })

    await expect(isFollowNewsSourcesEmailStillEligible(user.id)).resolves.toBe(true)
    await insertEntityRelation('relation__user__follow__rss_feed', user.id, feed.id)

    await expect(isFollowNewsSourcesEmailStillEligible(user.id)).resolves.toBe(false)
  })
})
