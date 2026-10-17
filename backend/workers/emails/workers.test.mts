import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { JobPayloadError } from '@queues/emails/payload/job-payload'
import { emails, processEmailJob } from './workers.mts'

describe('emails worker router', () => {
  afterAll(async () => {
    await emails.close()
  })

  it('moves a digest job still waiting in emails onto the email-digests domain', async () => {
    const sourceId = '00000000-0000-7000-8000-0000000000dd'
    const payload = {
      input: { userId: '00000000-0000-7000-8000-000000000001', trackingKey: 'daily:owned' },
      variables: { communities: [] },
    }
    const moved = await processEmailJob({
      id: sourceId,
      name: 'processSendCommunityModerationSummaryEmail',
      data: payload,
    } as Job)
    expect(moved).toMatchObject({
      name: 'email-digests.processSendCommunityModerationSummaryEmail',
      data: payload,
      opts: { deduplication: { id: `emails:legacy-digest:${sourceId}`, mode: 'simple' } },
    })
    await expect(
      processEmailJob({
        id: sourceId,
        name: 'processSendCommunityModerationSummaryEmail',
        data: payload,
      } as Job),
    ).resolves.toBeNull()
    await (moved as { remove: () => Promise<void> }).remove()
  })

  it('rejects a digest move that has no source id', async () => {
    await expect(
      processEmailJob({ name: 'dispatchEngagementEmails', data: {} } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
    await expect(
      processEmailJob({ name: 'processSendApiKeyExpiryReminder', data: {} } as Job),
    ).rejects.toBeInstanceOf(JobPayloadError)
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

  it('routes copyright notice email jobs to the copyright processor', async () => {
    await expect(
      processEmailJob({
        name: 'processSendCopyrightNoticeEmail',
        data: { intentId: '00000000-0000-7000-8000-000000000042' },
      } as Job),
    ).resolves.toBe(false)
  })
})
