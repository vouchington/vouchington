import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import { claimCurrentModerationSummaryForTest, createTestUserDirect } from '@voucha/test-helpers'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import {
  moderationSummaryVariableDefaults,
  processTestModerationSummaryEmail as processSendCommunityModerationSummaryEmail,
} from '@voucha/test-helpers/moderation-summary-collection'
import { processSendFollowNewsSourcesEmail } from './follow-news-sources.mts'
import { processSendFollowTopicsEmail } from './follow-topics.mts'
import { processSendPostReferralLinkEmail } from './post-referral-link.mts'

describe('engagement email recipient recovery', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  it('releases every claim when the user has no email address', async () => {
    const user = await createTestUserDirect({ withEmail: false })
    const { trackingKey, windowEnd, dispatchTimeZone } = await claimCurrentModerationSummaryForTest(
      user!.id,
    )
    await claimEngagementEmailSend(user!.id, 'follow_topics')
    await claimEngagementEmailSend(user!.id, 'post_referral_link')
    await claimEngagementEmailSend(user!.id, 'follow_news_sources')

    const input = { userId: user!.id }
    const commonVariables = {
      settingsUrl: 'https://voucha.ai/my/notification-settings',
      unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
      physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
    }
    await expect(
      processSendFollowTopicsEmail(input, {
        ...commonVariables,
        topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
      }),
    ).resolves.toMatchObject({ status: 'skipped' })
    await expect(
      processSendPostReferralLinkEmail(input, {
        ...commonVariables,
        referralPrograms: [{ name: 'Travel Card', url: 'https://voucha.ai/referrals/travel' }],
      }),
    ).resolves.toMatchObject({ status: 'skipped' })
    await expect(
      processSendFollowNewsSourcesEmail(input, {
        ...commonVariables,
        sources: [{ name: 'Travel Daily', url: 'https://voucha.ai/rss/travel' }],
      }),
    ).resolves.toMatchObject({ status: 'skipped' })
    await expect(
      processSendCommunityModerationSummaryEmail(
        { ...input, trackingKey, windowEnd },
        {
          generatedForDate: '2026-07-12',
          dispatchTimeZone,
          settingsUrl: commonVariables.settingsUrl,
          ...moderationSummaryVariableDefaults(),
          communities: [],
        },
      ),
    ).resolves.toMatchObject({ status: 'skipped' })
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})
