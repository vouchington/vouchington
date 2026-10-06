import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import { JobPayloadError } from '@queues/emails/payload/job-payload'
import { emails, isDispatcherJob, processEmailJob } from './workers.mts'

describe('emails worker router', () => {
  afterAll(async () => {
    await emails.close()
  })

  it('identifies dispatcher jobs', () => {
    expect(isDispatcherJob('dispatchApiKeyExpiryReminders')).toBe(true)
    expect(isDispatcherJob('dispatchEngagementEmails')).toBe(true)
    expect(isDispatcherJob('dispatchCommunityModerationSummaryEmails')).toBe(true)
    expect(isDispatcherJob('processSendFollowTopicsEmail')).toBe(false)
  })

  it('runs dispatcher jobs through the worker router', async () => {
    const dispatchEngagementEmails = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const dispatchCommunityModerationSummaryEmails = vi.fn<() => Promise<void>>(() =>
      Promise.resolve(),
    )
    const dispatchApiKeyExpiryReminders = vi.fn<() => Promise<{ hasMore: boolean }>>(() =>
      Promise.resolve({ hasMore: false }),
    )
    const dispatchers = {
      dispatchApiKeyExpiryReminders,
      dispatchEngagementEmails,
      dispatchCommunityModerationSummaryEmails,
    }

    await expect(
      processEmailJob({ name: 'dispatchEngagementEmails' } as Job, dispatchers),
    ).resolves.toBeUndefined()
    await expect(
      processEmailJob({ name: 'dispatchCommunityModerationSummaryEmails' } as Job, dispatchers),
    ).resolves.toBeUndefined()
    await expect(
      processEmailJob(
        { name: 'dispatchApiKeyExpiryReminders', data: { afterId: randomUUID() } } as Job,
        dispatchers,
      ),
    ).resolves.toEqual({ hasMore: false })
    expect(dispatchApiKeyExpiryReminders).toHaveBeenCalledWith({ afterId: expect.any(String) })
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
        {
          dispatchEngagementEmails,
          dispatchCommunityModerationSummaryEmails,
          dispatchApiKeyExpiryReminders: vi.fn<() => Promise<{ hasMore: boolean }>>(() =>
            Promise.resolve({ hasMore: false }),
          ),
        },
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

  it('routes a missing API key to the no-delivery result and rejects leaked secrets', async () => {
    const apiKeyId = randomUUID()
    await expect(
      processEmailJob({ name: 'processSendApiKeyExpiryReminder', data: { apiKeyId } } as Job),
    ).resolves.toBeNull()
    await expect(
      processEmailJob({
        name: 'processSendApiKeyExpiryReminder',
        data: { apiKeyId, rawKey: 'secret' },
      } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
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
