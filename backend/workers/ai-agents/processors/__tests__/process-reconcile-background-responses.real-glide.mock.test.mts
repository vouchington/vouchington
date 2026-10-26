import { randomUUID } from 'node:crypto'
import { Queue, UnrecoverableError, Worker, type Job } from 'glide-mq'
import { Responses } from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { findAiUsageRecordForAgent } from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import { sentryCaptureExceptionMock } from '@voucha/test-helpers/vitest.setup.sentry-mock'
import { aiAgentsQueueConfig } from '@queues/ai-agents/config'
import type { AIAgentJobData, ReconcileBackgroundResponsesJobData } from '@queues/ai-agents/types'
import { processReconcileBackgroundResponses } from '../process-reconcile-background-responses.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('bounded background response sweep pages', () => {
  beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'owned-sweep-page-provider-fixture'))
  afterEach(() => vi.unstubAllEnvs())

  it('bounds failed-job reads and advances past a poisoned response', async () => {
    await aiAgentsQueueConfig.waitForInitialization()
    const restoreLimit = overrideDynamicConfigFieldsForTest(aiAgentsQueueConfig, {
      background_response_reconcile_page_size: 1,
    })
    const name = `ai_failed_sweep_pages_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const response = {
      responseId: `resp_${randomUUID()}`,
      agentSlug: `failed-page-${randomUUID()}`,
      communityId: null,
      postId: null,
      createdAt: new Date().toISOString(),
    }
    const poison = { ...response, responseId: `resp_${randomUUID()}` }
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
      .mockRejectedValueOnce(new Error('poisoned provider response'))
      .mockResolvedValue(makeSdkResponse({ id: response.responseId, status: 'in_progress' }))
    const cancel = vi
      .spyOn(Responses.prototype, 'cancel')
      .mockResolvedValue(makeSdkResponse({ id: response.responseId, status: 'cancelled' }))
    const failed = Promise.withResolvers<void>()
    const failedIds = new Set<string>()
    const worker = new Worker<AIAgentJobData>(
      name,
      async () => {
        throw new UnrecoverableError('owned terminal queue fixture')
      },
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('failed', job => {
      if (job) failedIds.add(job.id)
      if (failedIds.size === 2) failed.resolve()
    })
    worker.on('error', failed.reject)
    try {
      await queue.add(
        'report-judgement',
        { backgroundResponses: [poison, response] } as AIAgentJobData,
        {
          attempts: 1,
          removeOnFail: false,
        },
      )
      await queue.add('report-judgement', {} as AIAgentJobData, {
        attempts: 1,
        removeOnFail: false,
      })
      await waitForRealGlideEvent(failed.promise, `AI failed sweep page ${name}`)
      await worker.close(true)

      const enqueued: ReconcileBackgroundResponsesJobData[] = []
      const enqueuePage = (data: ReconcileBackgroundResponsesJobData) => {
        enqueued.push(data)
        return queue.add('reconcile-background-responses', data)
      }
      const failedSweep = await queue.add('reconcile-background-responses', {
        phase: 'failed',
        failedOffset: 0,
        sweepId: randomUUID(),
        page: 0,
      })
      if (!failedSweep) throw new Error('Expected failed-job sweep')
      await processReconcileBackgroundResponses(
        failedSweep as Job<ReconcileBackgroundResponsesJobData>,
        { queue, enqueuePage, failedJobVisibilityCount: 0 },
      )
      expect(enqueued.at(-1)).toMatchObject({ phase: 'failed', failedOffset: 1 })
      const secondPage = (await queue.getJobs('waiting', 0, 10)).find(job => {
        const data = job.data as ReconcileBackgroundResponsesJobData
        return data.phase === 'failed' && data.failedOffset === 1
      })
      if (!secondPage) throw new Error('Expected second failed-job page')
      await processReconcileBackgroundResponses(
        secondPage as Job<ReconcileBackgroundResponsesJobData>,
        { queue, enqueuePage, failedJobVisibilityCount: 0 },
      )

      const cleanup = await queue.add('reconcile-background-responses', {
        phase: 'cleanup',
        failedOffset: 0,
        sweepId: randomUUID(),
        page: 0,
      })
      if (!cleanup) throw new Error('Expected cleanup sweep')
      await processReconcileBackgroundResponses(
        cleanup as Job<ReconcileBackgroundResponsesJobData>,
        { queue, enqueuePage, failedJobVisibilityCount: 0 },
      )
      expect(enqueued.at(-1)).toMatchObject({ phase: 'cleanup', failedOffset: expect.any(Number) })
      expect((await queue.getJobCounts()).failed).toBeGreaterThan(0)
      expect(retrieve).toHaveBeenCalled()
      expect(retrieve.mock.calls.map(([id]) => id)).toContain(poison.responseId)
      expect(cancel).toHaveBeenCalledWith(response.responseId, expect.anything())
    } finally {
      await worker.close(true)
      retrieve.mockRestore()
      cancel.mockRestore()
      await queue.obliterate({ force: true })
      await queue.close()
      restoreLimit()
    }
  })

  it('accounts for a good failed job after a persistent poison and removes only the settled job', async () => {
    await aiAgentsQueueConfig.waitForInitialization()
    const restoreLimit = overrideDynamicConfigFieldsForTest(aiAgentsQueueConfig, {
      background_response_reconcile_page_size: 2,
    })
    const name = `ai_poisoned_failed_page_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const poison = {
      responseId: `resp_${randomUUID()}`,
      agentSlug: `poisoned-${randomUUID()}`,
      communityId: null,
      postId: null,
      createdAt: new Date().toISOString(),
    }
    const good = {
      ...poison,
      responseId: `resp_${randomUUID()}`,
      agentSlug: `good-${randomUUID()}`,
    }
    const poisonError = new Error('provider response cannot be retrieved')
    const goodProviderResponse = makeSdkTextResponse('done', {
      id: good.responseId,
      model: 'gpt-6-luna-2026-10-01',
      service_tier: 'flex',
      usage: {
        input_tokens: 13,
        input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
        output_tokens: 5,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 18,
      },
    })
    const retrieve = vi.spyOn(Responses.prototype, 'retrieve').mockImplementation(responseId => {
      if (responseId === poison.responseId) throw poisonError
      if (responseId !== good.responseId) throw new Error(`Unexpected response: ${responseId}`)
      return Promise.resolve(goodProviderResponse) as unknown as ReturnType<
        typeof Responses.prototype.retrieve
      >
    })
    const failed = Promise.withResolvers<void>()
    const failedIds = new Set<string>()
    const worker = new Worker<AIAgentJobData>(
      name,
      async () => {
        throw new UnrecoverableError('owned terminal queue fixture')
      },
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('failed', job => {
      if (job) failedIds.add(job.id)
      if (failedIds.size === 2) failed.resolve()
    })
    worker.on('error', failed.reject)
    try {
      const poisonJob = await queue.add(
        'story-post',
        { post_id: randomUUID(), backgroundResponses: [poison] },
        { attempts: 1, removeOnFail: false },
      )
      const goodJob = await queue.add(
        'story-post',
        { post_id: randomUUID(), backgroundResponses: [good] },
        { attempts: 1, removeOnFail: false },
      )
      if (!poisonJob || !goodJob) throw new Error('Expected two failed-job fixtures')
      await waitForRealGlideEvent(failed.promise, `AI poison page ${name}`)
      await worker.close(true)

      const enqueued: ReconcileBackgroundResponsesJobData[] = []
      const enqueuePage = (data: ReconcileBackgroundResponsesJobData) => {
        enqueued.push(data)
        return queue.add('reconcile-background-responses', data)
      }
      const root = await queue.add('reconcile-background-responses', {
        phase: 'failed',
        failedOffset: 0,
        sweepId: randomUUID(),
        page: 0,
      })
      if (!root) throw new Error('Expected failed sweep job')
      await expect(
        processReconcileBackgroundResponses(root as Job<ReconcileBackgroundResponsesJobData>, {
          queue,
          enqueuePage,
          failedJobVisibilityCount: 0,
        }),
      ).resolves.toBeUndefined()
      await expect(
        findAiUsageRecordForAgent(good.agentSlug, { inputTokens: 13, outputTokens: 5 }),
      ).resolves.not.toBeNull()
      expect(enqueued.at(-1)).toMatchObject({ phase: 'failed', failedOffset: 2 })

      const next = (await queue.getJobs('waiting', 0, 10)).find(
        job =>
          job.name === 'reconcile-background-responses' &&
          (job.data as ReconcileBackgroundResponsesJobData).phase === 'failed' &&
          job.id !== root.id,
      )
      if (!next) throw new Error('Expected failed-page continuation')
      await processReconcileBackgroundResponses(next as Job<ReconcileBackgroundResponsesJobData>, {
        queue,
        enqueuePage,
        failedJobVisibilityCount: 0,
      })
      const cleanup = (await queue.getJobs('waiting', 0, 10)).find(
        job =>
          job.name === 'reconcile-background-responses' &&
          (job.data as ReconcileBackgroundResponsesJobData).phase === 'cleanup',
      )
      if (!cleanup) throw new Error('Expected cleanup page')
      await expect(
        processReconcileBackgroundResponses(cleanup as Job<ReconcileBackgroundResponsesJobData>, {
          queue,
          enqueuePage,
          failedJobVisibilityCount: 0,
        }),
      ).resolves.toBeUndefined()

      await expect(queue.getJob(poisonJob.id)).resolves.not.toBeNull()
      await expect(queue.getJob(goodJob.id)).resolves.toBeNull()
      expect(retrieve.mock.calls.filter(([id]) => id === poison.responseId).length).toBeGreaterThan(
        1,
      )
      expect(sentryCaptureExceptionMock.mock.calls.some(([error]) => error === poisonError)).toBe(
        true,
      )
    } finally {
      await worker.close(true)
      retrieve.mockRestore()
      await queue.obliterate({ force: true })
      await queue.close()
      restoreLimit()
    }
  })
})
