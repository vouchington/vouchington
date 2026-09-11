import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import { createTestUser, createTestUserDirect } from '@voucha/test-helpers'
import { claimModerationEmailSend } from '@services/communities/moderation-summary-emails'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import { processSendCommunityModerationSummaryEmail } from './community-moderation-summary.mts'
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
    const trackingKey = 'daily:2026-07-12'
    await claimEngagementEmailSend(user!.id, 'follow_topics')
    await claimEngagementEmailSend(user!.id, 'post_referral_link')
    await claimEngagementEmailSend(user!.id, 'follow_news_sources')
    await claimModerationEmailSend(user!.id, trackingKey)

    const input = { emailAddress: 'tests+stale@voucha.ai', userId: user!.id }
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
        { ...input, trackingKey },
        {
          generatedForDate: '2026-07-12',
          settingsUrl: commonVariables.settingsUrl,
          unsubscribeUrl: commonVariables.unsubscribeUrl,
          physicalAddress: commonVariables.physicalAddress,
          communities: [],
        },
      ),
    ).resolves.toMatchObject({ status: 'skipped' })
    expect(ses.sendEmail).not.toHaveBeenCalled()
  })
})

describe('engagement email legacy payload defaults', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(ses, 'sendEmail').mockResolvedValue({} as never)
  })

  const legacyFooter = {
    settingsUrl: 'https://voucha.ai/my/notification-settings',
    unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  }

  it('defaults physicalAddress for a legacy follow topics payload missing it', async () => {
    // Simulates a job enqueued by pre-deploy dispatcher code, before
    // physicalAddress became a required render prop.
    const user = await createTestUser()
    await claimEngagementEmailSend(user!.id, 'follow_topics')
    await processSendFollowTopicsEmail(
      { emailAddress: 'tests+legacy@voucha.ai', userId: user!.id },
      {
        ...legacyFooter,
        topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
      },
    )

    const [[sentEmail]] = vi.mocked(ses.sendEmail).mock.calls
    // Backfilled from getMarketingPostalAddress(); no MARKETING_POSTAL_ADDRESS
    // env var is set in tests, so this asserts the placeholder rendered.
    expect(sentEmail.text).toContain('[Voucha mailing address')
    expect(sentEmail.html).toContain('[Voucha mailing address')
    expect(sentEmail.text).not.toContain('undefined')
    expect(sentEmail.html).not.toContain('undefined')
  })

  it('defaults physicalAddress for a legacy post referral link payload missing it', async () => {
    const user = await createTestUser()
    await claimEngagementEmailSend(user!.id, 'post_referral_link')
    await processSendPostReferralLinkEmail(
      { emailAddress: 'tests+legacy@voucha.ai', userId: user!.id },
      {
        ...legacyFooter,
        referralPrograms: [
          { name: 'Travel Card', url: 'https://voucha.ai/referral-programs/travel-card' },
        ],
      },
    )

    const [[sentEmail]] = vi.mocked(ses.sendEmail).mock.calls
    expect(sentEmail.text).toContain('[Voucha mailing address')
    expect(sentEmail.html).toContain('[Voucha mailing address')
    expect(sentEmail.text).not.toContain('undefined')
    expect(sentEmail.html).not.toContain('undefined')
  })

  it('defaults physicalAddress for a legacy follow news sources payload missing it', async () => {
    const user = await createTestUser()
    await claimEngagementEmailSend(user!.id, 'follow_news_sources')
    await processSendFollowNewsSourcesEmail(
      { emailAddress: 'tests+legacy@voucha.ai', userId: user!.id },
      {
        ...legacyFooter,
        sources: [{ name: 'Consumer Travel Daily', url: 'https://voucha.ai/rss/travel' }],
      },
    )

    const [[sentEmail]] = vi.mocked(ses.sendEmail).mock.calls
    expect(sentEmail.text).toContain('[Voucha mailing address')
    expect(sentEmail.html).toContain('[Voucha mailing address')
    expect(sentEmail.text).not.toContain('undefined')
    expect(sentEmail.html).not.toContain('undefined')
  })
})
