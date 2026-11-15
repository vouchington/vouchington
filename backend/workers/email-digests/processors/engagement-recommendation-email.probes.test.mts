import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import { createTestUser, claimCurrentModerationSummaryForTest } from '@voucha/test-helpers'
import {
  createTestModerationEmailFooter,
  createTestNotificationEmailFooter,
  moderationSummaryVariableDefaults,
  processTestModerationSummaryEmail as processSendCommunityModerationSummaryEmail,
} from '@voucha/test-helpers/moderation-summary-collection'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import { updateUserFields } from '@services/users/update-fields'
import { processSendFollowTopicsEmail } from './follow-topics.mts'

const quietModerationCommunity = {
  communityId: '01900000-0000-7000-8000-000000000002',
  name: 'Travel Deals',
  url: 'https://voucha.ai/communities/travel-deals',
  pendingPostReviews: 1,
  pendingApplications: 1,
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
}

describe('engagement email preference suppression', () => {
  beforeEach(() => {
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  afterEach(() => vi.unstubAllEnvs())

  it('skips queued sends after notification preferences are disabled', async () => {
    const user = await createTestUser()
    const { trackingKey, windowEnd } = await claimCurrentModerationSummaryForTest(user!.id)
    await claimEngagementEmailSend(user!.id, 'follow_topics')
    await updateUserFields(user!.id, {
      is_engagement_emails_enabled: false,
      is_moderation_emails_enabled: false,
    })

    await expect(
      processSendFollowTopicsEmail(
        { emailAddress: 'tests+user@voucha.ai', userId: user!.id },
        {
          topics: [{ name: 'Travel', url: 'https://voucha.ai/topic/travel' }],
          ...createTestNotificationEmailFooter(),
        },
      ),
    ).resolves.toBeNull()
    await expect(
      processSendCommunityModerationSummaryEmail(
        { emailAddress: 'tests+moderator@voucha.ai', userId: user!.id, trackingKey, windowEnd },
        {
          generatedForDate: '2026-07-11',
          ...createTestModerationEmailFooter(),
          ...moderationSummaryVariableDefaults(),
          communities: [quietModerationCommunity],
        },
      ),
    ).resolves.toBeNull()
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})
