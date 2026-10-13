import {
  enqueueDispatchCommunityModerationSummaryEmails,
  enqueueDispatchEngagementEmails,
  enqueueSendCommunityInviteEmail,
  enqueueSendDataExportReadyEmail,
  enqueueSendEmailAddressLoginToken,
  enqueueSendEmailVerificationToken,
  enqueueSendFollowNewsSourcesEmail,
  enqueueSendFollowTopicsEmail,
  enqueueSendPostReferralLinkEmail,
  enqueueSendWelcomeEmail,
} from './enqueues.mts'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs, readEnqueuedJob } from '@voucha/test-helpers'
import { SECRET_BEARING_EMAIL_JOBS } from './enqueues/job-options.mts'
import { emails } from './queues.mts'
import { upsertSchedules } from './enqueues/schedules.mts'

describe('enqueues.generated', () => {
  describe('enqueueSendEmailAddressLoginToken', () => {
    it('enqueues the login email with its recipient and template variables', async () => {
      const input = {
        emailAddress: 'tests@voucha.ai',
      }
      const variables = {
        token: '123456',
        expiration: '1 hour',
      }
      const enqueued = await enqueueSendEmailAddressLoginToken(input, variables)
      const job = await readEnqueuedJob(emails, enqueued)
      expect(job).toMatchObject({
        name: 'processSendEmailAddressLoginToken',
        data: { input, variables },
      })
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

  describe('credential-bearing jobs', () => {
    const input = { emailAddress: 'tests@voucha.ai' }
    const credentialEnqueues = {
      processSendEmailAddressLoginToken: () =>
        enqueueSendEmailAddressLoginToken(input, { token: 'ABC123', expiration: '15 minutes' }),
      processSendEmailVerificationToken: () =>
        enqueueSendEmailVerificationToken(input, { token: 'ABC123' }),
      processSendCommunityInviteEmail: () =>
        enqueueSendCommunityInviteEmail(input, {
          communityName: 'Test Community',
          inviterName: 'Test User',
          code: 'a3f9c2e1',
        }),
      processSendDataExportReadyEmail: () =>
        enqueueSendDataExportReadyEmail(input, {
          downloadUrl: 'https://downloads.example/export.zip?signature=secret',
          expiresInDays: 7,
        }),
    }

    it('covers every job that carries a credential', () => {
      expect(Object.keys(credentialEnqueues).toSorted()).toEqual(
        [...SECRET_BEARING_EMAIL_JOBS].toSorted(),
      )
    })

    it.each(Object.entries(credentialEnqueues))(
      'drops a %s job as soon as it finishes, succeeded or failed',
      async (jobName, enqueue) => {
        const job = await readEnqueuedJob(emails, await enqueue())

        expect(job).toMatchObject({
          name: jobName,
          opts: { removeOnComplete: true, removeOnFail: true },
        })
      },
    )

    it('keeps the default retained history for an email that carries no credential', async () => {
      const enqueued = await enqueueSendWelcomeEmail(
        { userId: crypto.randomUUID() },
        { userName: 'Test User' },
      )

      expect(await readEnqueuedJob(emails, enqueued)).toMatchObject({
        name: 'processSendWelcomeEmail',
        opts: { removeOnComplete: 100, removeOnFail: 100 },
      })
    })
  })
})
