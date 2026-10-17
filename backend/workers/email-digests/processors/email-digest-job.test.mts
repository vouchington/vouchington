import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { JobPayloadError } from '@queues/email-digests/payload/job-payload'
import { processEmailDigestJob } from './email-digest-job.mts'

function dispatchers() {
  return {
    dispatchEngagementEmails: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    dispatchCommunityModerationSummaryEmails: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    dispatchApiKeyExpiryReminders: vi.fn<() => Promise<{ hasMore: boolean }>>(() =>
      Promise.resolve({ hasMore: false }),
    ),
  }
}

describe('email-digests job router', () => {
  it('runs dispatcher jobs through the router', async () => {
    const run = dispatchers()

    await expect(
      processEmailDigestJob('dispatchEngagementEmails', {}, run),
    ).resolves.toBeUndefined()
    await expect(
      processEmailDigestJob('dispatchCommunityModerationSummaryEmails', {}, run),
    ).resolves.toBeUndefined()
    await expect(
      processEmailDigestJob('dispatchApiKeyExpiryReminders', { afterId: randomUUID() }, run),
    ).resolves.toEqual({ hasMore: false })
    expect(run.dispatchApiKeyExpiryReminders).toHaveBeenCalledWith({ afterId: expect.any(String) })
    expect(run.dispatchEngagementEmails).toHaveBeenCalledOnce()
    expect(run.dispatchCommunityModerationSummaryEmails).toHaveBeenCalledOnce()
  })

  it('rejects a template payload for a dispatcher before the dispatcher runs', async () => {
    const run = dispatchers()

    await expect(
      processEmailDigestJob(
        'dispatchEngagementEmails',
        { input: { userId: 'user' }, variables: { token: 'secret' } },
        run,
      ),
    ).rejects.toBeInstanceOf(JobPayloadError)
    expect(run.dispatchEngagementEmails).not.toHaveBeenCalled()
  })

  it('routes a send to its template processor with the parsed recipient and variables', async () => {
    const processSendFollowTopicsEmail = vi.fn<() => Promise<string>>(() => Promise.resolve('sent'))
    const variables = {
      userName: 'Ada',
      topics: [{ name: 'News', url: 'https://example.test/t' }],
      settingsUrl: 'https://example.test/settings',
      unsubscribeUrl: 'https://example.test/unsubscribe',
    }
    const templates = {
      processSendFollowTopicsEmail,
      processSendPostReferralLinkEmail: vi.fn<() => Promise<unknown>>(),
      processSendFollowNewsSourcesEmail: vi.fn<() => Promise<unknown>>(),
      processSendCommunityModerationSummaryEmail: vi.fn<() => Promise<unknown>>(),
    }

    await expect(
      processEmailDigestJob(
        'processSendFollowTopicsEmail',
        { input: { userId: 'user' }, variables },
        dispatchers(),
        templates,
      ),
    ).resolves.toBe('sent')
    expect(processSendFollowTopicsEmail).toHaveBeenCalledWith({ userId: 'user' }, variables)
  })

  it('routes a missing API key to the no-delivery result and rejects leaked secrets', async () => {
    const apiKeyId = randomUUID()
    await expect(
      processEmailDigestJob('processSendApiKeyExpiryReminder', { apiKeyId }),
    ).resolves.toBeNull()
    await expect(
      processEmailDigestJob('processSendApiKeyExpiryReminder', { apiKeyId, rawKey: 'secret' }),
    ).rejects.toBeInstanceOf(JobPayloadError)
  })

  it('rejects a transactional job that does not belong to this domain', async () => {
    await expect(processEmailDigestJob('processSendWelcomeEmail', {})).rejects.toBeInstanceOf(
      JobPayloadError,
    )
  })
})
