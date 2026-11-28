import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  claimCurrentModerationSummaryForTest,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import {
  moderationSummaryVariableDefaults,
  processTestModerationSummaryEmail as processSendCommunityModerationSummaryEmail,
} from '@voucha/test-helpers/moderation-summary-collection'

describe('processSendCommunityModerationSummaryEmail', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not resend when SES fails after the summary was marked', async () => {
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
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user!.id,
    )

    const input = {
      userId: user!.id,
      trackingKey,
      windowEnd,
    }
    const variables = {
      generatedForDate: '2026-07-13',
      dispatchTimeZone,
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      ...moderationSummaryVariableDefaults(),
      communities: [
        {
          communityId: '01900000-0000-7000-8000-000000000001',
          name: 'Travel Deals',
          url: 'https://voucha.ai/communities/travel-deals',
          pendingPostReviews: 1,
          pendingApplications: 0,
          pendingReports: 0,
          escalatedItems: 0,
          suspectedBanEvaders: 0,
          newMembers: 0,
          departedMembers: 0,
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

    vi.mocked(ses.sendEmail).mockRejectedValueOnce(new Error('SES outcome unknown'))
    const firstSend = processSendCommunityModerationSummaryEmail(input, variables)
    await expect(firstSend).rejects.toThrow('SES outcome unknown')
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
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user!.id,
    )
    await removeTestCommunityMember(community.id, user!.id)

    await expect(
      processSendCommunityModerationSummaryEmail(
        { userId: user!.id, trackingKey, windowEnd },
        {
          generatedForDate: '2026-07-12',
          dispatchTimeZone,
          settingsUrl: 'https://voucha.ai/my/notification-settings',
          ...moderationSummaryVariableDefaults(),
          communities: [
            {
              communityId: '01900000-0000-7000-8000-000000000001',
              name: 'Travel Deals',
              url: 'https://voucha.ai/communities/travel-deals',
              pendingPostReviews: 1,
              pendingApplications: 0,
              pendingReports: 0,
              escalatedItems: 0,
              suspectedBanEvaders: 0,
              newMembers: 0,
              departedMembers: 0,
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
})
