import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { enqueueBulkSendCopyrightNoticeEmails } from './enqueues.mts'
import { emails } from './queues.mts'

describe('copyright notice email enqueues', () => {
  it('bulk-enqueues one email job per intent with its own dedup id', async () => {
    const intentIds = [randomUUID(), randomUUID()]
    await enqueueBulkSendCopyrightNoticeEmails(intentIds)

    for (const intentId of intentIds) {
      const jobs = await emails.searchJobs({
        name: 'processSendCopyrightNoticeEmail',
        data: { intentId },
      })
      expect(jobs).toHaveLength(1)
      expect(jobs[0]?.opts).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: 100,
        removeOnFail: 100,
        priority: 10,
        deduplication: {
          id: `copyright-delivery:${intentId}:email`,
          mode: 'throttle',
          ttl: 300_000,
        },
      })
    }
  })
})
