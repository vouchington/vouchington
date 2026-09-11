import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import {
  disconnectRequestedJobOptions,
  enqueueBackfillBlueskyDisconnectRequests,
  enqueueBackfillBlueskyFollowPropagation,
  enqueueDisconnectRequested,
  enqueueBulkDisconnectRequested,
  enqueueReconcileBlueskyFollow,
  type DisconnectRequestedData,
} from './enqueues.mts'
import { blueskyFollowPropagation } from './queues.mts'

const actualGlideMq = createRequire(import.meta.url)('glide-mq') as typeof import('glide-mq')

// Real integration test: enqueue against the in-memory glide-mq test queue and assert the
// emitted jobs' data and deduplication options, instead of mocking the enqueue factory.
describe('bluesky follow propagation enqueue helpers', () => {
  it('enqueues a reconcileFollow job with the pair and debounce dedup', async () => {
    const followerUserId = `user-${randomUUID()}`
    const followeeUserId = `user-${randomUUID()}`

    await enqueueReconcileBlueskyFollow(followerUserId, followeeUserId)

    const waiting = await blueskyFollowPropagation.getJobs('waiting')
    const jobs = waiting.filter(
      j =>
        (j.data as { followerUserId?: string }).followerUserId === followerUserId &&
        (j.data as { followeeUserId?: string }).followeeUserId === followeeUserId,
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0].opts).toMatchObject({
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      priority: 10,
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: {
        id: `reconcile_${followerUserId}__${followeeUserId}`,
        mode: 'debounce',
        ttl: 5000,
      },
    })
  })

  it('debounce-collapses a repeated enqueue for the same pair into the first job', async () => {
    const followerUserId = `user-${randomUUID()}`
    const followeeUserId = `user-${randomUUID()}`

    const first = await enqueueReconcileBlueskyFollow(followerUserId, followeeUserId)
    const second = await enqueueReconcileBlueskyFollow(followerUserId, followeeUserId)

    const expectedDedupId = `reconcile_${followerUserId}__${followeeUserId}`
    expect((first as { opts?: { deduplication?: { id?: string } } })?.opts?.deduplication?.id).toBe(
      expectedDedupId,
    )
    // The referenced job is still waiting, so the shim's dedup, faithful to production's debounce
    // state-gating, skips the second enqueue outright rather than creating a second job.
    expect(second).toBeNull()

    const waiting = await blueskyFollowPropagation.getJobs('waiting')
    const jobs = waiting.filter(
      j =>
        (j.data as { followerUserId?: string }).followerUserId === followerUserId &&
        (j.data as { followeeUserId?: string }).followeeUserId === followeeUserId,
    )
    expect(jobs).toHaveLength(1)
  })

  it('enqueues the singleton backfill job with throttle deduplication', async () => {
    await enqueueBackfillBlueskyFollowPropagation()

    const waiting = await blueskyFollowPropagation.getJobs('waiting')
    const job = waiting.find(
      j =>
        (j.opts as { deduplication?: { id?: string } }).deduplication?.id ===
        'backfill_bluesky_follow_propagation',
    )
    expect(job).toBeDefined()
    expect(job!.data).toEqual({})
    expect(job!.opts).toMatchObject({
      attempts: 3,
      backoff: { delay: 5000, type: 'exponential' },
      priority: 100,
      removeOnComplete: 100,
      removeOnFail: 100,
      deduplication: {
        id: 'backfill_bluesky_follow_propagation',
        mode: 'throttle',
        ttl: 3_600_000,
      },
    })
  })

  it('configures terminal disconnect state for immediate removal', async () => {
    const data = {
      userId: `user-${randomUUID()}`,
      blueskyDid: `did:plc:${randomUUID()}`,
      linkAuthorizationId: randomUUID(),
    }

    const job = await enqueueDisconnectRequested(data)
    const logicalId = `disconnect_${data.userId}_${data.linkAuthorizationId}`

    expect(job).toMatchObject({
      id: logicalId,
      opts: {
        jobId: logicalId,
        deduplication: { id: logicalId, mode: 'simple' },
        removeOnComplete: true,
        removeOnFail: true,
      },
    })
  })

  it('bulk-enqueues each exact disconnect generation with stable options', async () => {
    const data = [
      {
        userId: `user-${randomUUID()}`,
        blueskyDid: `did:plc:${randomUUID()}`,
        linkAuthorizationId: randomUUID(),
      },
      {
        userId: `user-${randomUUID()}`,
        blueskyDid: `did:plc:${randomUUID()}`,
        linkAuthorizationId: randomUUID(),
      },
    ]

    const jobs = await enqueueBulkDisconnectRequested(data)

    expect(jobs).toHaveLength(2)
    for (const [index, job] of jobs.entries()) {
      const logicalId = `disconnect_${data[index].userId}_${data[index].linkAuthorizationId}`
      expect(job).toMatchObject({
        data: data[index],
        opts: {
          jobId: logicalId,
          deduplication: { id: logicalId, mode: 'simple' },
          removeOnComplete: true,
          removeOnFail: true,
        },
      })
    }
  })

  it('enqueues the disconnect backfill singleton with throttle deduplication', async () => {
    const job = await enqueueBackfillBlueskyDisconnectRequests()

    expect(job).toMatchObject({
      data: {},
      opts: {
        priority: 100,
        deduplication: {
          id: 'backfill_bluesky_disconnect_requests',
          mode: 'throttle',
          ttl: 3_600_000,
        },
      },
    })
  })

  it('recreates the stable disconnect job after terminal failure', async () => {
    const queueName = `test-bluesky-disconnect-reenqueue-${crypto.randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new actualGlideMq.Queue(queueName, connection)
    let shouldFail = true
    const worker = new actualGlideMq.Worker(
      queueName,
      () =>
        shouldFail ? Promise.reject(new Error('expected terminal failure')) : Promise.resolve(),
      connection,
    )
    worker.on('error', () => undefined)
    const data: DisconnectRequestedData = {
      userId: crypto.randomUUID(),
      blueskyDid: `did:plc:${crypto.randomUUID()}`,
      linkAuthorizationId: crypto.randomUUID(),
    }
    const opts = disconnectRequestedJobOptions(data)

    try {
      const failed = once(worker, 'failed')
      const first = await queue.add('disconnectRequested', data, opts)
      await failed

      expect(first?.id).toBe(opts.jobId)
      expect(await queue.getJob(opts.jobId!)).toBeNull()

      shouldFail = false
      const completed = once(worker, 'completed')
      const recreated = await queue.add('disconnectRequested', data, opts)
      await completed

      expect(recreated?.id).toBe(opts.jobId)
      expect(await queue.getJob(opts.jobId!)).toBeNull()
    } finally {
      await worker.close()
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
