import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { readAllQueueJobs } from '../../test-helpers/queue-jobs.mts'
import {
  enqueueBulkDeliverActivity,
  enqueueBulkDistributeActivity,
  enqueueDistributeActivity,
  type DistributeActivityData,
} from './enqueues.mts'
import { activitypubDelivery } from './queues.mts'

function followData(activityId = randomUUID()): DistributeActivityData {
  return {
    activityId,
    activityType: 'Follow',
    sourceUserId: randomUUID(),
    targetUserId: randomUUID(),
  }
}

describe('ActivityPub delivery enqueues', () => {
  it('orders a single distribution without deduplication', async () => {
    const data = followData()

    await enqueueDistributeActivity(data)

    const jobs = (await readAllQueueJobs(activitypubDelivery)).filter(
      job => (job.data as { activityId?: string }).activityId === data.activityId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({
      name: 'distributeActivity',
      data,
      opts: {
        priority: 10,
        ordering: { key: `activitypub-distribute__${data.activityId}`, concurrency: 1 },
      },
    })
    expect(jobs[0]!.opts.deduplication).toBeUndefined()
    expect(jobs[0]!.opts.jobId).toBeUndefined()
  })

  it('orders every bulk distribution by its activity identity', async () => {
    const inputs = [followData(), followData()]

    await enqueueBulkDistributeActivity(inputs)

    const activityIds = new Set(inputs.map(input => input.activityId))
    const jobs = (await readAllQueueJobs(activitypubDelivery)).filter(job =>
      activityIds.has((job.data as { activityId: string }).activityId),
    )
    expect(jobs).toHaveLength(2)
    for (const job of jobs) {
      const activityId = (job.data as { activityId: string }).activityId
      expect(job.opts).toMatchObject({
        priority: 10,
        ordering: { key: `activitypub-distribute__${activityId}`, concurrency: 1 },
      })
      expect(job.opts.deduplication).toBeUndefined()
      expect(job.opts.jobId).toBeUndefined()
    }
  })

  it('preserves the exact delivery simple-deduplication key', async () => {
    const data = followData()
    const inboxUrl = `https://${randomUUID()}.example/inbox`

    await enqueueBulkDeliverActivity([{ ...data, inboxUrl }])

    const jobs = (await readAllQueueJobs(activitypubDelivery)).filter(
      job =>
        job.name === 'deliverActivity' &&
        (job.data as { activityId?: string }).activityId === data.activityId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]!.opts).toMatchObject({
      priority: 10,
      deduplication: {
        id: `deliver_${data.activityId}__${inboxUrl}`,
        mode: 'simple',
      },
    })
    expect(jobs[0]!.opts.ordering).toBeUndefined()
  })
})
