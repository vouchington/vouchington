import { afterAll, describe, expect, it } from 'vitest'
import type { Job } from 'glide-mq'
import { JobPayloadError } from '@queues/emails/payload/job-payload'
import { emails, processEmailJob } from './workers.mts'

describe('emails worker router', () => {
  afterAll(async () => {
    await emails.close()
  })

  it('rejects a job that left the queue for the email-digests domain', async () => {
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
