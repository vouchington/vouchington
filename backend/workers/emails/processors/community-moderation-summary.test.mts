import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import {
  claimModerationEmailSend,
  formatLocalDate,
} from '@services/communities/moderation-summary-emails'
import { updateUserFields } from '@services/users/update-fields'
import { processSendCommunityModerationSummaryEmail } from './community-moderation-summary.mts'

describe('processSendCommunityModerationSummaryEmail', () => {
  beforeEach(() => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('skips moderation summaries already marked as sent', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Already sent moderator post',
      slug: `already-sent-moderator-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const trackingKey = 'daily:2026-07-13'
    await claimModerationEmailSend(user!.id, trackingKey)

    const input = { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey }
    const variables = {
      generatedForDate: '2026-07-13',
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
      communities: [
        {
          name: 'Travel Deals',
          url: 'https://voucha.ai/communities/travel-deals',
          pendingPostReviews: 1,
          pendingApplications: 0,
          pendingReports: 0,
          escalatedItems: 0,
          suspectedBanEvaders: 0,
          netMemberChange: 0,
          totalActiveMembers: 0,
          newDiscussionPosts: 0,
          newReviewPosts: 0,
          newDataPointPosts: 0,
          topDiscussionTitle: null,
          topDiscussionReplyCount: 0,
          activeMemberCount: 0,
          activeMemberRate: 0,
        },
      ],
    }

    await processSendCommunityModerationSummaryEmail(input, variables)
    vi.mocked(ses.sendEmail).mockClear()

    await expect(processSendCommunityModerationSummaryEmail(input, variables)).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })

  it('skips queued moderation summaries after moderator access is removed', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Removed moderator post',
      slug: `removed-moderator-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const trackingKey = 'daily:2026-07-12'
    await claimModerationEmailSend(user!.id, trackingKey)
    await removeTestCommunityMember(community.id, user!.id)

    await expect(
      processSendCommunityModerationSummaryEmail(
        { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey },
        {
          generatedForDate: '2026-07-12',
          settingsUrl: 'https://voucha.ai/my/notification-settings',
          unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
          physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
          communities: [
            {
              name: 'Travel Deals',
              url: 'https://voucha.ai/communities/travel-deals',
              pendingPostReviews: 1,
              pendingApplications: 0,
              pendingReports: 0,
              escalatedItems: 0,
              suspectedBanEvaders: 0,
              netMemberChange: 0,
              totalActiveMembers: 0,
              newDiscussionPosts: 0,
              newReviewPosts: 0,
              newDataPointPosts: 0,
              topDiscussionTitle: null,
              topDiscussionReplyCount: 0,
              activeMemberCount: 0,
              activeMemberRate: 0,
            },
          ],
        },
      ),
    ).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })

  it('recomputes the summary date after refreshing current moderation counts', async () => {
    const user = await createTestUser()
    await updateUserFields(user!.id, { moderation_email_timezone: 'UTC' })
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Recomputed date moderator post',
      slug: `recomputed-date-moderator-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const trackingKey = 'daily:1900-01-01'
    await claimModerationEmailSend(user!.id, trackingKey)
    const expectedDate = formatLocalDate(new Date(), 'UTC')

    await processSendCommunityModerationSummaryEmail(
      { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey },
      {
        generatedForDate: '1900-01-01',
        settingsUrl: 'https://voucha.ai/my/notification-settings',
        unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
        physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
        communities: [
          {
            name: 'Stale Queued Community',
            url: 'https://voucha.ai/communities/stale',
            pendingPostReviews: 1,
            pendingApplications: 0,
            pendingReports: 0,
            escalatedItems: 0,
            suspectedBanEvaders: 0,
            netMemberChange: 0,
            totalActiveMembers: 0,
            newDiscussionPosts: 0,
            newReviewPosts: 0,
            newDataPointPosts: 0,
            topDiscussionTitle: null,
            topDiscussionReplyCount: 0,
            activeMemberCount: 0,
            activeMemberRate: 0,
          },
        ],
      },
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: `Community moderation summary for ${expectedDate}`,
        text: expect.stringContaining(`summary for ${expectedDate}`),
        headers: expect.objectContaining({
          'List-Unsubscribe': expect.stringContaining('/api/v1/email-unsubscribe?token='),
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    )
  })

  it('backfills unsubscribeUrl and physicalAddress for a legacy queue payload missing them', async () => {
    const user = await createTestUser()
    await updateUserFields(user!.id, { moderation_email_timezone: 'UTC' })
    const community = await insertTestCommunity({ createdById: user!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: user!.id,
      role: 'owner',
      approvedById: user!.id,
    })
    const postId = await insertTestPost({
      title: 'Legacy payload moderator post',
      slug: `legacy-payload-moderator-post-${user!.id}`,
      createdById: user!.id,
      markdown: 'Needs review.',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user!.id,
    })
    const trackingKey = 'daily:legacy-payload'
    await claimModerationEmailSend(user!.id, trackingKey)

    // Simulates a job enqueued by pre-deploy dispatcher code, before
    // unsubscribeUrl/physicalAddress became required render props.
    const legacyVariables = {
      generatedForDate: '2026-07-12',
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      communities: [
        {
          name: 'Travel Deals',
          url: 'https://voucha.ai/communities/travel-deals',
          pendingPostReviews: 1,
          pendingApplications: 0,
          pendingReports: 0,
          escalatedItems: 0,
          suspectedBanEvaders: 0,
          netMemberChange: 0,
          totalActiveMembers: 0,
          newDiscussionPosts: 0,
          newReviewPosts: 0,
          newDataPointPosts: 0,
          topDiscussionTitle: null,
          topDiscussionReplyCount: 0,
          activeMemberCount: 0,
          activeMemberRate: 0,
        },
      ],
    }

    await processSendCommunityModerationSummaryEmail(
      { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey },
      legacyVariables,
    )

    expect(ses.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('/email/unsubscribe?token='),
        headers: expect.objectContaining({
          'List-Unsubscribe': expect.stringContaining('/api/v1/email-unsubscribe?token='),
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }),
      }),
    )
    const [[sentEmail]] = vi.mocked(ses.sendEmail).mock.calls
    // Backfilled from getMarketingPostalAddress(); no MARKETING_POSTAL_ADDRESS
    // env var is set in tests, so this asserts the placeholder rendered.
    expect(sentEmail.text).toContain('[Voucha mailing address')
    expect(sentEmail.text).not.toContain('undefined')
    expect(sentEmail.html).not.toContain('undefined')
  })
})
