import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as ses from '@modules/aws/ses'
import {
  createTestUser,
  getEngagementEmailDeliveryStateForTest,
  type EngagementEmailType,
} from '@voucha/test-helpers'
import { claimEngagementEmailSend } from '@services/users/engagement-emails'
import { processSendFollowNewsSourcesEmail } from './follow-news-sources.mts'
import { processSendFollowTopicsEmail } from './follow-topics.mts'
import { processSendPostReferralLinkEmail } from './post-referral-link.mts'

vi.mock<typeof import('@modules/aws/ses')>(import('@modules/aws/ses'), async importOriginal => {
  const actual = await importOriginal<typeof import('@modules/aws/ses')>()
  return { ...actual, sendEmail: vi.fn<typeof actual.sendEmail>() }
})

const notificationEmailFooter = {
  settingsUrl: 'https://voucha.ai/my/notification-settings',
  unsubscribeUrl: 'https://voucha.ai/my/notification-settings',
  physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
}

describe('engagement email delivery guarantees', () => {
  beforeEach(() => {
    process.env.VOUCHA_STORED_SECRET_ENCRYPTION_KEYS = 'test:raw32:this fake test key is not secret'
    vi.mocked(ses.sendEmail).mockReset()
  })

  it('reports when an engagement email delivery state is missing', async () => {
    const user = await createTestUser()

    await expect(getEngagementEmailDeliveryStateForTest(user!.id, 'follow_topics')).rejects.toThrow(
      `No engagement email delivery state for user ${user!.id} and type follow_topics`,
    )
  })

  it.each([['follow_topics'], ['post_referral_link'], ['follow_news_sources']] as const)(
    'does not retry %s after delivery is attempted',
    async emailType => {
      const user = await createTestUser()
      await claimEngagementEmailSend(user!.id, emailType)
      const sesError = new Error('SES unavailable')
      const sendEmail = vi.mocked(ses.sendEmail).mockImplementationOnce(async () => {
        // Observe persisted state here to prove the attempt marker precedes the provider call.
        const stateAtSesBoundary = await getEngagementEmailDeliveryStateForTest(user!.id, emailType)
        expect(stateAtSesBoundary.claimed_at).toBeInstanceOf(Date)
        expect(stateAtSesBoundary.delivery_attempted_at).toBeInstanceOf(Date)
        expect(stateAtSesBoundary.sent_at).toBeNull()
        throw sesError
      })

      await expect(processEngagementEmail(emailType, user!.id)).rejects.toBe(sesError)

      const stateAfterFailure = await getEngagementEmailDeliveryStateForTest(user!.id, emailType)
      expect(stateAfterFailure.claimed_at).toBeInstanceOf(Date)
      expect(stateAfterFailure.delivery_attempted_at).toBeInstanceOf(Date)
      expect(stateAfterFailure.sent_at).toBeNull()
      await expect(processEngagementEmail(emailType, user!.id)).resolves.toBeNull()
      const stateAfterRetry = await getEngagementEmailDeliveryStateForTest(user!.id, emailType)
      expect(stateAfterRetry.sent_at).toBeNull()
      expect(sendEmail).toHaveBeenCalledTimes(1)
    },
  )
})

async function processEngagementEmail(emailType: EngagementEmailType, userId: string) {
  const input = { emailAddress: 'tests+user@voucha.ai', userId }
  if (emailType === 'follow_topics') {
    return processSendFollowTopicsEmail(input, {
      topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
      ...notificationEmailFooter,
    })
  }
  if (emailType === 'post_referral_link') {
    return processSendPostReferralLinkEmail(input, {
      referralPrograms: [
        { name: 'Travel Card', url: 'https://voucha.ai/referral-programs/travel-card' },
      ],
      ...notificationEmailFooter,
    })
  }
  return processSendFollowNewsSourcesEmail(input, {
    sources: [{ name: 'Consumer Travel Daily', url: 'https://voucha.ai/rss/travel' }],
    ...notificationEmailFooter,
  })
}
