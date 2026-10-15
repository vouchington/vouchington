import { randomUUID } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  forgetDedupEntries,
  removeQueuedJobsById,
} from '../../../test-helpers/shared-queue-cleanup.mts'
import {
  enqueueBulkProcessAppleNotifications,
  enqueueProcessAppleNotification,
  enqueueRecoverAppleNotifications,
} from './apple-notifications.mts'
import { memberships } from '../queues.mts'

describe('enqueueProcessAppleNotification', () => {
  const created: string[] = []
  afterEach(async () => {
    await removeQueuedJobsById(memberships, created.splice(0))
    forgetDedupEntries(BACKGROUND_QUEUE_NAME, ['apple-notification-recovery'])
  })

  it('deduplicates the durable evidence and serializes one Apple lineage', async () => {
    const data = {
      evidenceId: randomUUID(),
      providerLineageId: '1000000123456789',
      environment: 'test' as const,
    }
    await enqueueProcessAppleNotification(data)
    const jobId = `apple-notification__${data.evidenceId}`
    created.push(jobId)

    expect(await memberships.getJob(jobId)).toMatchObject({
      id: jobId,
      name: 'memberships.processAppleNotification',
      data,
      opts: {
        priority: 10,
        attempts: 10,
        deduplication: { id: jobId, mode: 'simple' },
        ordering: {
          key: `memberships:apple-lineage:test:${data.providerLineageId}`,
          concurrency: 1,
        },
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
    created.push(`apple-notification__${data.evidenceId}`)

    expect(job).toMatchObject({
      id: `apple-notification__${data.evidenceId}`,
      data,
      opts: {
        deduplication: { id: `apple-notification__${data.evidenceId}`, mode: 'simple' },
        ordering: {
          key: `memberships:apple-lineage:test:${data.providerLineageId}`,
          concurrency: 1,
        },
      },
    })
  })

  it('uses a throttled five-minute bucket for notification recovery', async () => {
    const timeBucket = 5_666_666
    const jobId = `apple-notification-recovery__${timeBucket}`
    forgetDedupEntries(BACKGROUND_QUEUE_NAME, ['apple-notification-recovery'])
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(timeBucket * 300_000 + 123)
    try {
      await enqueueRecoverAppleNotifications()
      created.push(jobId)
      expect(await memberships.getJob(jobId)).toMatchObject({
        data: {},
        opts: {
          priority: 100,
          deduplication: { id: 'apple-notification-recovery', mode: 'throttle', ttl: 300_000 },
        },
      })
    } finally {
      dateNow.mockRestore()
    }
  })
})
