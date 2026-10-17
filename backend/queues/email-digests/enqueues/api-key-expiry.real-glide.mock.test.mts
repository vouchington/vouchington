import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  enqueueBulkSendApiKeyExpiryReminders,
  enqueueDispatchApiKeyExpiryReminders,
} from './api-key-expiry.mts'
import { emailDigests as emails } from '../queues.mts'
import {
  EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB,
  EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB,
} from '@queues/background/enqueues/email-digests-jobs'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('API-key reminder enqueues with real GlideMQ', () => {
  afterAll(() => emails.close())
  it('persists an identifier-only reminder with bounded retries and throttled deduplication', async () => {
    const apiKeyId = randomUUID()
    const [job] = await enqueueBulkSendApiKeyExpiryReminders([apiKeyId])
    expect(job).toMatchObject({
      name: EMAIL_DIGESTS_SEND_API_KEY_EXPIRY_JOB.name,
      data: { apiKeyId },
      opts: {
        attempts: 3,
        priority: 10,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        deduplication: {
          id: `email-digests:api-key-expiry:${apiKeyId}`,
          mode: 'throttle',
          ttl: 60_000,
        },
      },
    })
    await enqueueBulkSendApiKeyExpiryReminders([apiKeyId])
    const jobs = (await Promise.all(QUEUE_STATES.map(state => emails.getJobs(state, 0, -1)))).flat()
    expect(
      jobs.filter(item => (item.data as { apiKeyId?: string }).apiKeyId === apiKeyId),
    ).toHaveLength(1)
  })

  it('deduplicates dispatcher jobs and persists no credential payload', async () => {
    const first = await enqueueDispatchApiKeyExpiryReminders()
    await expect(enqueueDispatchApiKeyExpiryReminders()).resolves.toBeNull()
    const jobs = (await Promise.all(QUEUE_STATES.map(state => emails.getJobs(state, 0, -1)))).flat()
    const dispatcher =
      first ?? jobs.find(job => job.name === EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB.name)
    expect(dispatcher).toMatchObject({
      name: EMAIL_DIGESTS_DISPATCH_API_KEY_EXPIRY_JOB.name,
      data: {},
      opts: {
        attempts: 3,
        priority: 100,
        deduplication: {
          id: 'email-digests:api-key-expiry-dispatch:root',
          mode: 'throttle',
          ttl: 60_000,
        },
      },
    })
  })
})
