import { randomUUID } from 'node:crypto'
import { UnrecoverableError, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { closeAndUnregisterGlideMQInstance } from '@data-stores/valkey-glide-mq'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { AIAgentJobData } from '../types.mts'
import { enqueueBulkAutoDispatchJudgements } from './auto-dispatch-judgement.mts'
import {
  classifierRunDispatcherJobId,
  enqueueBulkClassifierRunDispatchers,
  enqueueClassifierRunDispatcher,
} from './classifier-run.mts'
import { enqueueReconcileClassifierRunsPage } from './reconcile-classifier-runs.mts'

// The real worker has its own Valkey namespace and cannot consume another test's AI jobs.
vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0])
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})
vi.mock<typeof import('glide-mq')>(import('glide-mq'), importOriginal => importOriginal())

describe('classifier control-job recovery with real GlideMQ', () => {
  it('reoffers terminal stable IDs after settlement while leaving live claims and response owners intact', async () => {
    const dispatcher = { classifier: 'post-classifier', postId: randomUUID(), rssFeedItemId: null }
    const dispatcherId = classifierRunDispatcherJobId(dispatcher)
    const page = {
      phase: 'requests' as const,
      classifier: `c-${randomUUID()}`,
      after: randomUUID(),
    }
    const pageId = `reconcile_classifier_runs_requests_${page.classifier}_${page.after}`
    const judgement = {
      judgement_id: randomUUID(),
      entity_type: 'post' as const,
      entity_id: randomUUID(),
      community_id: null,
    }
    const dispatcherFailed = Promise.withResolvers<void>()
    const pageFailed = Promise.withResolvers<void>()
    const judgementFailed = Promise.withResolvers<void>()
    const worker = new Worker<AIAgentJobData>(
      AI_AGENTS_QUEUE_NAME,
      async (_job: Job<AIAgentJobData>) => {
        throw new UnrecoverableError('synthetic control-job failure')
      },
      { connection: workerQueueConnection, prefix: workerQueuePrefix, blockTimeout: 100 },
    )
    worker.on('failed', job => {
      if (job?.id === dispatcherId) dispatcherFailed.resolve()
      if (job?.id === pageId) pageFailed.resolve()
      if (job?.name === 'auto-dispatch-judgement') judgementFailed.resolve()
    })
    worker.on('error', error => {
      dispatcherFailed.reject(error)
      pageFailed.reject(error)
      judgementFailed.reject(error)
    })
    let workerClosed = false
    try {
      await worker.waitUntilReady()
      await enqueueClassifierRunDispatcher(dispatcher)
      const firstPage = await enqueueReconcileClassifierRunsPage(page)
      const firstJudgements = await enqueueBulkAutoDispatchJudgements([judgement])
      expect(firstPage?.id).toBe(pageId)
      expect(firstJudgements).toHaveLength(1)
      await Promise.all([
        waitForRealGlideEvent(dispatcherFailed.promise, `failed dispatcher ${dispatcherId}`),
        waitForRealGlideEvent(pageFailed.promise, `failed sweep page ${pageId}`),
        waitForRealGlideEvent(
          judgementFailed.promise,
          `failed judgement ${judgement.judgement_id}`,
        ),
      ])
      await worker.close(true)
      workerClosed = true

      const retained = await ai_agents.getJob(dispatcherId)
      await expect(retained?.getState()).resolves.toBe('failed')
      if (!retained) throw new Error('Expected retained failed dispatcher')
      await retained.updateData({
        ...retained.data,
        backgroundResponses: [
          {
            responseId: `resp_${randomUUID()}`,
            agentSlug: 'post-classifier',
            communityId: null,
            postId: dispatcher.postId,
            createdAt: new Date().toISOString(),
          },
        ],
      })
      await enqueueBulkClassifierRunDispatchers([dispatcher])
      await expect((await ai_agents.getJob(dispatcherId))?.getState()).resolves.toBe('failed')

      await retained.updateData({ ...retained.data, backgroundResponses: [] })
      await enqueueBulkClassifierRunDispatchers([dispatcher])
      await expect((await ai_agents.getJob(dispatcherId))?.getState()).resolves.toBe('prioritized')
      await enqueueBulkClassifierRunDispatchers([dispatcher])
      expect(
        await ai_agents.searchJobs({
          name: 'classifier-run-dispatcher',
          data: { postId: dispatcher.postId },
        }),
      ).toHaveLength(1)

      const secondPage = await enqueueReconcileClassifierRunsPage(page)
      expect(secondPage?.id).toBe(pageId)
      await expect((await ai_agents.getJob(pageId))?.getState()).resolves.toBe('prioritized')

      // GlideMQ releases a simple dedup key on failure even when it retains the failed record.
      const secondJudgements = await enqueueBulkAutoDispatchJudgements([judgement])
      expect(secondJudgements).toHaveLength(1)
      expect(secondJudgements[0]?.id).not.toBe(firstJudgements[0]?.id)
      await expect((await ai_agents.getJob(firstJudgements[0]!.id))?.getState()).resolves.toBe(
        'failed',
      )
    } finally {
      if (!workerClosed) await worker.close(true)
      await ai_agents.obliterate({ force: true })
      await closeAndUnregisterGlideMQInstance(ai_agents)
    }
  })
})
