import {
  enqueueDispatchCommunityModerationSummaryEmails,
  enqueueDispatchEngagementEmails,
  enqueueSendEmailAddressLoginToken,
  enqueueSendFollowNewsSourcesEmail,
  enqueueSendFollowTopicsEmail,
  enqueueSendPostReferralLinkEmail,
} from './enqueues.mts'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '@voucha/test-helpers'
import { emails } from './queues.mts'
import { upsertSchedules } from './enqueues/schedules.mts'

describe('enqueues.generated', () => {
  describe('enqueueSendEmailAddressLoginToken', () => {
    it('should send an email', async () => {
      const input = {
        emailAddress: 'tests@voucha.ai',
      }
      const variables = {
        token: '123456',
        expiration: '1 hour',
      }
      const result = await enqueueSendEmailAddressLoginToken(input, variables)
      expect(result).toBeDefined()
    })
  })

  it('enqueues the dispatcher jobs', async () => {
    await enqueueDispatchEngagementEmails()
    await enqueueDispatchCommunityModerationSummaryEmails()

    const jobs = await readAllQueueJobs(emails)
    expect(jobs.some(job => job.name === 'dispatchEngagementEmails')).toBe(true)
    expect(jobs.some(job => job.name === 'dispatchCommunityModerationSummaryEmails')).toBe(true)
  })

  it('upserts dispatcher schedules', async () => {
    await expect(upsertSchedules()).resolves.toBeUndefined()
  })

  it('enqueues the new engagement email jobs', async () => {
    await enqueueSendFollowTopicsEmail(
      { userId: '00000000-0000-7000-8000-000000000001' },
      {
        userName: 'Test User',
        topics: [{ name: 'Travel', url: 'https://voucha.ai/topics/travel' }],
        settingsUrl: 'https://voucha.ai/my/notifications',
        unsubscribeUrl: 'https://voucha.ai/my/notifications',
        physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
      },
    )
    await enqueueSendPostReferralLinkEmail(
      { userId: '00000000-0000-7000-8000-000000000001' },
      {
        userName: 'Test User',
        referralPrograms: [
          { name: 'Travel Card', url: 'https://voucha.ai/referral-programs/travel-card' },
        ],
        settingsUrl: 'https://voucha.ai/my/notifications',
        unsubscribeUrl: 'https://voucha.ai/my/notifications',
        physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
      },
    )
    await enqueueSendFollowNewsSourcesEmail(
      { userId: '00000000-0000-7000-8000-000000000001' },
      {
        userName: 'Test User',
        sources: [{ name: 'Consumer Travel Daily', url: 'https://voucha.ai/rss/travel' }],
        settingsUrl: 'https://voucha.ai/my/notifications',
        unsubscribeUrl: 'https://voucha.ai/my/notifications',
        physicalAddress: 'Voucha, 123 Test St, Test City, CA 94000',
      },
    )

    const jobs = await readAllQueueJobs(emails)
    expect(jobs.some(job => job.name === 'processSendFollowTopicsEmail')).toBe(true)
    expect(jobs.some(job => job.name === 'processSendPostReferralLinkEmail')).toBe(true)
    expect(jobs.some(job => job.name === 'processSendFollowNewsSourcesEmail')).toBe(true)
  })
})
