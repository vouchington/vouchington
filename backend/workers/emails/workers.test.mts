import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import {
  emailJobContractCoversCanonicalTypes,
  JobPayloadError,
} from '@queues/emails/payload/job-payload'
import { emails, isDispatcherJob, processEmailJob } from './workers.mts'

describe('emails worker router', () => {
  afterAll(async () => {
    await emails.close()
  })

  it('identifies dispatcher jobs', () => {
    expect(isDispatcherJob('dispatchEngagementEmails')).toBe(true)
    expect(isDispatcherJob('dispatchCommunityModerationSummaryEmails')).toBe(true)
    expect(isDispatcherJob('processSendFollowTopicsEmail')).toBe(false)
  })

  it('runs dispatcher jobs through the worker router', async () => {
    const dispatchEngagementEmails = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const dispatchCommunityModerationSummaryEmails = vi.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    )
    const dispatchers = {
      dispatchEngagementEmails,
      dispatchCommunityModerationSummaryEmails,
    }

    await expect(
      processEmailJob({ name: 'dispatchEngagementEmails' } as Job, dispatchers),
    ).resolves.toBeUndefined()
    await expect(
      processEmailJob({ name: 'dispatchCommunityModerationSummaryEmails' } as Job, dispatchers),
    ).resolves.toBeUndefined()
    expect(dispatchEngagementEmails).toHaveBeenCalledOnce()
    expect(dispatchCommunityModerationSummaryEmails).toHaveBeenCalledOnce()
  })

  it('rejects a template payload for a dispatcher before the dispatcher runs', async () => {
    const dispatchEngagementEmails = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const dispatchCommunityModerationSummaryEmails = vi.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    )

    await expect(
      processEmailJob(
        {
          name: 'dispatchEngagementEmails',
          data: { input: { userId: 'user' }, variables: { token: 'secret' } },
        } as Job,
        { dispatchEngagementEmails, dispatchCommunityModerationSummaryEmails },
      ),
    ).rejects.toBeInstanceOf(JobPayloadError)
    expect(dispatchEngagementEmails).not.toHaveBeenCalled()
  })

  it('rejects login variables for the welcome template', async () => {
    await expect(
      processEmailJob({
        name: 'processSendWelcomeEmail',
        data: {
          input: { userId: '00000000-0000-7000-8000-000000000001' },
          variables: { token: 'secret', expiration: '1 hour' },
        },
      } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })

  it('rejects a copyright payload without a delivery intent identifier', async () => {
    await expect(
      processEmailJob({
        name: 'processSendCopyrightNoticeEmail',
        data: {},
      } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })

  it('keeps the email payload contract aligned with the enqueue types', () => {
    expect(emailJobContractCoversCanonicalTypes()).toBe(true)
  })

  it('routes copyright notice email jobs to the copyright processor', async () => {
    await expect(
      processEmailJob({
        name: 'processSendCopyrightNoticeEmail',
        data: { intentId: '00000000-0000-7000-8000-000000000042' },
      } as Job),
    ).resolves.toBe(false)
  })
})
