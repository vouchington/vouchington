import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { processSendCommunityModerationSummaryEmail } from './community-moderation-summary.mts'
import { processSendFollowNewsSourcesEmail } from './follow-news-sources.mts'
import { processSendFollowTopicsEmail } from './follow-topics.mts'
import { processSendPostReferralLinkEmail } from './post-referral-link.mts'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import { claimModerationEmailSend } from '@services/communities/moderation-summary-emails'
import { updateUserFields } from '@services/users/update-fields'

const zeroActivityDigestFields = {
  netMemberChange: 0,
  totalActiveMembers: 0,
  newDiscussionPosts: 0,
  newReviewPosts: 0,
  newDataPointPosts: 0,
  topDiscussionTitle: null,
  topDiscussionReplyCount: 0,
  activeMemberCount: 0,
  activeMemberRate: 0,
}

const quietModerationCommunity = {
  name: 'Travel Deals',
  url: 'https://voucha.ai/communities/travel-deals',
  pendingPostReviews: 1,
  pendingApplications: 1,
  pendingReports: 0,
  escalatedItems: 0,
  suspectedBanEvaders: 0,
  ...zeroActivityDigestFields,
}

const notificationEmailFooter = {
  settingsUrl: 'https://voucha.ai/my/notification-settings',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
}

describe('engagement email processors', () => {
  beforeEach(() => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('renders follow topics email and sends via SES', async () => {
    const user = await createTestUser()
    await claimEngagementEmailSend(user!.id, 'follow_topics')
    await processSendFollowTopicsEmail(
      { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
      {
        topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
        ...notificationEmailFooter,
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.stringContaining('Travel'),
      }),
    )
  })

  it('renders post referral link email and sends via SES', async () => {
    const user = await createTestUser()
    await claimEngagementEmailSend(user!.id, 'post_referral_link')
    await processSendPostReferralLinkEmail(
      { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
      {
        referralPrograms: [
          { name: 'Travel Card', url: 'https://voucha.ai/referral-programs/travel-card' },
        ],
        ...notificationEmailFooter,
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.stringContaining('Travel Card'),
      }),
    )
  })

  it('renders follow news sources email and sends via SES', async () => {
    const user = await createTestUser()
    await claimEngagementEmailSend(user!.id, 'follow_news_sources')
    await processSendFollowNewsSourcesEmail(
      { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
      {
        sources: [{ name: 'Consumer Travel Daily', url: 'https://voucha.ai/rss/travel' }],
        ...notificationEmailFooter,
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: user!.email_address,
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.stringContaining('Consumer Travel Daily'),
      }),
    )
  })

  it('renders community moderation summary email and sends via SES', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Queued moderation post',
      slug: `queued-moderation-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const trackingKey = 'daily:2026-07-09'
    await claimModerationEmailSend(user!.id, trackingKey)
    const currentEmailAddress = user!.email_address!
    await processSendCommunityModerationSummaryEmail(
      {
        emailAddress: 'tests+moderator@voucha.ai',
        userId: user!.id,
        trackingKey,
      },
      {
        generatedForDate: '2026-07-09',
        ...notificationEmailFooter,
        communities: [
          {
            name: 'Travel Deals',
            url: 'https://voucha.ai/communities/travel-deals',
            pendingPostReviews: 3,
            pendingApplications: 2,
            pendingReports: 1,
            escalatedItems: 0,
            suspectedBanEvaders: 1,
            ...zeroActivityDigestFields,
          },
        ],
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: currentEmailAddress,
        subject: expect.any(String),
        html: expect.any(String),
        text: expect.stringContaining(community.name),
      }),
    )
  })

  it('skips already marked engagement and moderation sends', async () => {
    const user = await createTestUser()
    const trackingKey = 'daily:2026-07-10'
    await claimEngagementEmailSend(user!.id, 'follow_topics')
    await claimEngagementEmailSend(user!.id, 'post_referral_link')
    await claimEngagementEmailSend(user!.id, 'follow_news_sources')
    await claimModerationEmailSend(user!.id, trackingKey)

    await processSendFollowTopicsEmail(
      { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
      {
        topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
        ...notificationEmailFooter,
      },
    )
    await processSendPostReferralLinkEmail(
      { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
      {
        referralPrograms: [
          { name: 'Travel Card', url: 'https://voucha.ai/referral-programs/travel-card' },
        ],
        ...notificationEmailFooter,
      },
    )
    await processSendFollowNewsSourcesEmail(
      { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
      {
        sources: [{ name: 'Consumer Travel Daily', url: 'https://voucha.ai/rss/travel' }],
        ...notificationEmailFooter,
      },
    )
    await processSendCommunityModerationSummaryEmail(
      { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey },
      {
        generatedForDate: '2026-07-10',
        ...notificationEmailFooter,
        communities: [quietModerationCommunity],
      },
    )
    vi.mocked(ses.sendEmail).mockClear()

    await expect(
      processSendFollowTopicsEmail(
        { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
        {
          topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
          ...notificationEmailFooter,
        },
      ),
    ).resolves.toBeNull()
    await expect(
      processSendPostReferralLinkEmail(
        { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
        {
          referralPrograms: [
            { name: 'Travel Card', url: 'https://voucha.ai/referral-programs/travel-card' },
          ],
          ...notificationEmailFooter,
        },
      ),
    ).resolves.toBeNull()
    await expect(
      processSendFollowNewsSourcesEmail(
        { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
        {
          sources: [{ name: 'Consumer Travel Daily', url: 'https://voucha.ai/rss/travel' }],
          ...notificationEmailFooter,
        },
      ),
    ).resolves.toBeNull()
    await expect(
      processSendCommunityModerationSummaryEmail(
        { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey },
        {
          generatedForDate: '2026-07-10',
          ...notificationEmailFooter,
          communities: [quietModerationCommunity],
        },
      ),
    ).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })

  it('skips queued sends after notification preferences are disabled', async () => {
    const user = await createTestUser()
    const trackingKey = 'daily:2026-07-11'
    await claimEngagementEmailSend(user!.id, 'follow_topics')
    await claimModerationEmailSend(user!.id, trackingKey)
    await updateUserFields(user!.id, {
      engagement_emails_enabled: false,
      moderation_emails_enabled: false,
    })

    await expect(
      processSendFollowTopicsEmail(
        { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
        {
          topics: [{ name: 'Travel', url: 'https://voucha.ai/topic/travel' }],
          ...notificationEmailFooter,
        },
      ),
    ).resolves.toBeNull()
    await expect(
      processSendCommunityModerationSummaryEmail(
        { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey },
        {
          generatedForDate: '2026-07-11',
          ...notificationEmailFooter,
          communities: [quietModerationCommunity],
        },
      ),
    ).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})
