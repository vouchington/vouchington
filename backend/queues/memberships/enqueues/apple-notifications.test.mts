import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enqueueBulkProcessAppleNotifications,
  enqueueProcessAppleNotification,
  enqueueRecoverAppleNotifications,
} from './apple-notifications.mts'
import { memberships } from '../queues.mts'

const QUEUE_STATES = ['waiting', 'active', 'completed', 'failed', 'delayed'] as const

describe('enqueueProcessAppleNotification', () => {
  afterEach(() => memberships.obliterate({ force: true }))

  it('deduplicates the durable evidence and serializes one Apple lineage', async () => {
    const data = {
      evidenceId: randomUUID(),
      providerLineageId: '1000000123456789',
      environment: 'test' as const,
    }
    await enqueueProcessAppleNotification(data)
    const jobs = (await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state)))).flat()
    const jobId = `apple-notification__${data.evidenceId}`

    expect(jobs.find(job => job.id === jobId)).toMatchObject({
      id: jobId,
      data,
      opts: {
        deduplication: { id: jobId, mode: 'simple' },
        ordering: { key: `apple-lineage:test:${data.providerLineageId}`, concurrency: 1 },
      },
    })
  })

  it('uses the same stable identity when recovery bulk-enqueues notification work', async () => {
    const data = {
      evidenceId: randomUUID(),
      providerLineageId: '1000000123456789',
      environment: 'test' as const,
    }

    const [job] = await enqueueBulkProcessAppleNotifications([data])

    expect(job).toMatchObject({
      id: `apple-notification__${data.evidenceId}`,
      data,
      opts: {
        deduplication: { id: `apple-notification__${data.evidenceId}`, mode: 'simple' },
        ordering: { key: `apple-lineage:test:${data.providerLineageId}`, concurrency: 1 },
      },
    })
  })

  it('uses a throttled five-minute bucket for notification recovery', async () => {
    const timeBucket = 5_666_666
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(timeBucket * 300_000 + 123)
    try {
      await enqueueRecoverAppleNotifications()
      const jobs = (await Promise.all(QUEUE_STATES.map(state => memberships.getJobs(state)))).flat()
      expect(
        jobs.find(job => job.id === `apple-notification-recovery__${timeBucket}`),
      ).toMatchObject({
        data: {},
        opts: {
          deduplication: { id: 'apple-notification-recovery', mode: 'throttle', ttl: 300_000 },
        },
      })
    } finally {
      dateNow.mockRestore()
    }
  })
})
