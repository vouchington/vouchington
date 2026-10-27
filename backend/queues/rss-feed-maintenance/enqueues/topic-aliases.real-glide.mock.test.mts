import { randomUUID } from 'node:crypto'
import { UnrecoverableError, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { QUEUE_NAME } from '../config.mts'
import { rssFeedMaintenance } from '../queues.mts'
import { enqueueContinueInvalidatingPostsForTopicAliases } from './topic-aliases.mts'

// The dedicated real-glide project isolates the key prefix, so this queue cannot reach the fleet.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('topic alias post-invalidation continuation through real GlideMQ', () => {
  it('re-activates a terminally failed continuation when the parent page retries', async () => {
    const topicAliasIds = [randomUUID(), randomUUID()]
    const changeId = randomUUID()
    const afterPostId = randomUUID()
    let outcome: 'fail' | 'complete' = 'fail'
    let runs = 0
    const settled = new Map<number, PromiseWithResolvers<void>>()
    const settledRun = (run: number) => {
      const existing = settled.get(run)
      if (existing) return existing
      const created = Promise.withResolvers<void>()
      settled.set(run, created)
      return created
    }
    const worker = new Worker<{ changeId: string }>(
      QUEUE_NAME,
      async (job: Job<{ changeId: string }>) => {
        if (job.data.changeId !== changeId) return
        runs += 1
        if (outcome === 'fail') throw new UnrecoverableError('expected terminal job failure')
      },
      { connection: workerQueueConnection, prefix: workerQueuePrefix, blockTimeout: 1000 },
    )
    worker.on('error', () => undefined)
    worker.on('completed', job => {
      if (job.data.changeId === changeId) settledRun(runs).resolve()
    })
    worker.on('failed', job => {
      if (job?.data.changeId === changeId) settledRun(runs).resolve()
    })

    try {
      await worker.waitUntilReady()
      const [first] = (await enqueueContinueInvalidatingPostsForTopicAliases(
        topicAliasIds,
        changeId,
        afterPostId,
      )) as Job[]
      await waitForRealGlideEvent(settledRun(1).promise, 'first continuation')
      await expect(first?.getState()).resolves.toBe('failed')

      outcome = 'complete'
      const retried = (await enqueueContinueInvalidatingPostsForTopicAliases(
        [...topicAliasIds].toReversed(),
        changeId,
        afterPostId,
      )) as Job[]
      await waitForRealGlideEvent(settledRun(2).promise, 'reactivated continuation')

      expect(retried.map(job => job.id)).toEqual([first?.id])
      expect(runs).toBe(2)
    } finally {
      try {
        await worker.close()
      } finally {
        try {
          await rssFeedMaintenance.obliterate({ force: true })
        } finally {
          await closeAndUnregisterGlideMQInstance(rssFeedMaintenance)
        }
      }
    }
  }, 30_000)
})
