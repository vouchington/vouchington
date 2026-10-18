import { randomUUID } from 'node:crypto'
import { Worker, type Job } from 'glide-mq'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { readEnqueuedJob } from '@voucha/test-helpers'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { voteAggregation } from '../queues.mts'
import {
  enqueueRecalculateUserVoteWeight,
  enqueueRecalculateVoteWeightEvents,
  enqueueVoteWeightDirtyMarkers,
} from './vote-weight.mts'

// Retained native job records are the replay boundary; the in-memory queue adapter has no hashes.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

async function enqueueAndComplete<T extends Job | Job[]>(enqueue: () => Promise<T>): Promise<T> {
  const completed = Promise.withResolvers<void>()
  const seen = new Set<string>()
  let expectedId: string | undefined
  const worker = new Worker(BACKGROUND_QUEUE_NAME, async () => undefined, {
    connection: workerQueueConnection,
    prefix: workerQueuePrefix,
    blockTimeout: 1000,
  })
  worker.on('error', error => completed.reject(error))
  worker.on('failed', (_job, error) => completed.reject(error))
  worker.on('completed', job => {
    seen.add(job.id)
    if (job.id === expectedId) completed.resolve()
  })
  try {
    await worker.waitUntilReady()
    const added = await enqueue()
    const jobs = Array.isArray(added) ? added : [added]
    expect(jobs).toHaveLength(1)
    const id = jobs[0]!.id
    expectedId = id
    if (seen.has(id)) completed.resolve()
    await completed.promise
    return added
  } finally {
    await worker.close()
  }
}

describe('vote-weight event replay through real GlideMQ', () => {
  afterAll(() => voteAggregation.close())

  it('reactivates a retained completed event when an overlap reads it again', async () => {
    const userId = randomUUID()
    const jobId = `voteWeight__${userId}__membershipExpired__${randomUUID()}`
    try {
      const first = await enqueueAndComplete(() =>
        enqueueRecalculateVoteWeightEvents([{ userId, jobId }]),
      )
      expect(first.map(job => job.id)).toEqual([jobId])
      await expect((await voteAggregation.getJob(jobId))?.getState()).resolves.toBe('completed')
      const replay = await enqueueAndComplete(() =>
        enqueueRecalculateVoteWeightEvents([{ userId, jobId }]),
      )
      expect(replay.map(job => job.id)).toEqual([jobId])
      await expect((await voteAggregation.getJob(jobId))?.getState()).resolves.toBe('completed')
    } finally {
      await (await voteAggregation.getJob(jobId))?.remove()
    }
  })

  it('reactivates the stable force id for a later administrator recalculation', async () => {
    const userId = randomUUID()
    const jobId = `voteWeight__${userId}__force`
    const enqueue = async () => {
      const result = await enqueueRecalculateUserVoteWeight(userId, true)
      if (!Array.isArray(result) || result.length !== 1)
        throw new Error('Expected one forced vote-weight job')
      return readEnqueuedJob(voteAggregation, result[0])
    }
    try {
      const first = await enqueueAndComplete(enqueue)
      expect(first.id).toBe(jobId)
      await expect((await voteAggregation.getJob(jobId))?.getState()).resolves.toBe('completed')
      const replay = await enqueueAndComplete(enqueue)
      expect(replay.id).toBe(jobId)
      await expect(voteAggregation.getJob(jobId)).resolves.toMatchObject({
        id: jobId,
        data: { userId, forceRecalculate: true },
      })
    } finally {
      await (await voteAggregation.getJob(jobId))?.remove()
    }
  })

  it('reactivates a finished dispatcher continuation with the same stable id', async () => {
    const data = { afterId: `ffffffff-ffff-4fff-8fff-${randomUUID().slice(24)}` }
    let jobId: string | undefined
    try {
      const first = await enqueueAndComplete(async () =>
        readEnqueuedJob(voteAggregation, await enqueueVoteWeightDirtyMarkers(data)),
      )
      jobId = first.id
      await expect((await voteAggregation.getJob(jobId))?.getState()).resolves.toBe('completed')
      const replay = await enqueueAndComplete(async () =>
        readEnqueuedJob(voteAggregation, await enqueueVoteWeightDirtyMarkers(data)),
      )
      expect(replay.id).toBe(jobId)
    } finally {
      if (jobId) await (await voteAggregation.getJob(jobId))?.remove()
    }
  })
})
