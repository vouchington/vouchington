import { randomUUID } from 'node:crypto'
import { Queue, UnrecoverableError, Worker } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { ai_agents } from '../queues.mts'
import type { AIAgentJobData } from '../types.mts'
import { enqueueReconcileBackgroundResponsesPage } from './reconcile-background-responses.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

describe('AI agent failed-job retention with real GlideMQ', () => {
  it('keeps the only pending response record after failures from another AI job family', async () => {
    const name = `ai_response_retention_${randomUUID()}`
    const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
    const queue = new Queue<AIAgentJobData>(name, connection)
    const companion = await enqueueReconcileBackgroundResponsesPage({
      phase: 'failed',
      sweepId: randomUUID(),
      page: 0,
    })
    if (!companion) throw new Error('Expected a real AI reconciler enqueue')
    const firstFailed = Promise.withResolvers<void>()
    const laterFailed = Promise.withResolvers<void>()
    const response = {
      responseId: `resp_${randomUUID()}`,
      agentSlug: 'story-post',
      communityId: null,
      postId: null,
      createdAt: new Date().toISOString(),
    }
    const ownerId = randomUUID()
    let laterFailureCount = 0
    const worker = new Worker<AIAgentJobData>(
      name,
      async () => {
        throw new UnrecoverableError('synthetic terminal failure')
      },
      { ...connection, concurrency: 32, blockTimeout: 100 },
    )
    worker.on('failed', job => {
      if (job?.id === ownerId) firstFailed.resolve()
      else if (job && ++laterFailureCount === 101) laterFailed.resolve()
    })
    worker.on('error', error => {
      firstFailed.reject(error)
      laterFailed.reject(error)
    })

    try {
      await worker.waitUntilReady()
      const owner = await queue.add(
        'story-post',
        { post_id: randomUUID(), backgroundResponses: [response] },
        { jobId: ownerId, attempts: 1, removeOnFail: false },
      )
      if (!owner) throw new Error('Expected pending-response owner job')
      await waitForRealGlideEvent(firstFailed.promise, `pending-response owner ${owner.id}`)

      // The former shared count of 100 trims the oldest failed job when these 101 fail.
      await queue.addBulk(
        Array.from({ length: 101 }, () => ({
          name: 'autotagger-rss-feed-item' as const,
          data: { rss_feed_item_id: randomUUID() },
          opts: { attempts: 1, removeOnFail: companion.opts.removeOnFail },
        })),
      )
      await waitForRealGlideEvent(laterFailed.promise, `later AI failures ${name}`)
      const retained = await queue.getJob(owner.id)
      expect(retained?.data.backgroundResponses).toEqual([response])
      await expect(retained?.getState()).resolves.toBe('failed')
      expect(companion.opts.removeOnFail).toBe(false)
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
      await (await ai_agents.getJob(companion.id))?.remove()
    }
  })
})
