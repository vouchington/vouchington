import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it, vi } from 'vitest'
import {
  enqueueBulkSendApiKeyExpiryReminders,
  enqueueDispatchApiKeyExpiryReminders,
} from './api-key-expiry.mts'
import { emails } from '../queues.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('API-key reminder enqueues with real GlideMQ', () => {
  afterAll(() => emails.close())
  it('persists an identifier-only reminder with bounded retries and throttled deduplication', async () => {
    const apiKeyId = randomUUID()
    const [job] = await enqueueBulkSendApiKeyExpiryReminders([apiKeyId])
    expect(job).toMatchObject({
      name: 'processSendApiKeyExpiryReminder',
      data: { apiKeyId },
      opts: {
        attempts: 3,
        priority: 10,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        deduplication: { id: `api-key-expiry:${apiKeyId}`, mode: 'throttle', ttl: 60_000 },
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
    const dispatcher = first ?? jobs.find(job => job.name === 'dispatchApiKeyExpiryReminders')
    expect(dispatcher).toMatchObject({
      name: 'dispatchApiKeyExpiryReminders',
      data: {},
      opts: {
        attempts: 3,
        priority: 100,
        deduplication: { id: 'api-key-expiry-dispatch', mode: 'throttle', ttl: 60_000 },
      },
    })
  })
})
