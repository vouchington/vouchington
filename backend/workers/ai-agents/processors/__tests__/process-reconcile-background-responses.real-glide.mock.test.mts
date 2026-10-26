import { randomUUID } from 'node:crypto'
import { Queue, UnrecoverableError, Worker, type Job } from 'glide-mq'
import { Responses } from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  countBackgroundResponseRegistrations,
  ageBackgroundResponseRegistration,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import { registerBackgroundResponse } from '@services/openai-background-responses/register'
import { openaiBackgroundResponsesWorkConfig } from '@services/openai-background-responses/work-limits'
import type { AIAgentJobData, ReconcileBackgroundResponsesJobData } from '@queues/ai-agents/types'
import { processReconcileBackgroundResponses } from '../process-reconcile-background-responses.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('bounded background response sweep pages', () => {
  beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'owned-sweep-page-provider-fixture'))
  afterEach(() => vi.unstubAllEnvs())

  it('advances past aged inline rows without leases and follows with a failed-job sweep', async () => {
    await openaiBackgroundResponsesWorkConfig.waitForInitialization()
    const restoreLimit = overrideDynamicConfigFieldsForTest(openaiBackgroundResponsesWorkConfig, {
      reconcile_batch_size: 1,
    })
    const name = `ai_inline_sweep_pages_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const older = `resp_${randomUUID()}`
    const newer = `resp_${randomUUID()}`
    const agentSlug = `inline-page-${randomUUID()}`
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
      .mockResolvedValue(makeSdkTextResponse('done', { usage: undefined }))
    try {
      await registerBackgroundResponse({ responseId: older, agentSlug })
      await registerBackgroundResponse({ responseId: newer, agentSlug })
      await ageBackgroundResponseRegistration(older, new Date('2010-01-01T00:00:00Z'))
      await ageBackgroundResponseRegistration(newer, new Date('2010-01-02T00:00:00Z'))
      const root = await queue.add('reconcile-background-responses', {
        phase: 'inline',
        sweepId: randomUUID(),
        page: 0,
      })
      if (!root) throw new Error('Expected root sweep job')
      const enqueuePage = (data: ReconcileBackgroundResponsesJobData) =>
        queue.add('reconcile-background-responses', data)
      await processReconcileBackgroundResponses(root as Job<ReconcileBackgroundResponsesJobData>, {
        queue,
        enqueuePage,
      })
      const firstPage = (await queue.getJobs('waiting', 0, 5)).find(
        job => job.id !== root.id && (job.data as ReconcileBackgroundResponsesJobData).inlineAfter,
      )
      if (!firstPage) throw new Error('Expected first inline continuation')
      await processReconcileBackgroundResponses(
        firstPage as Job<ReconcileBackgroundResponsesJobData>,
        { queue, enqueuePage },
      )
      await expect(countBackgroundResponseRegistrations(older)).resolves.toBe(0)
      await expect(countBackgroundResponseRegistrations(newer)).resolves.toBe(0)
      expect(retrieve).toHaveBeenCalledTimes(2)
    } finally {
      retrieve.mockRestore()
      await queue.obliterate({ force: true })
      await queue.close()
      restoreLimit()
    }
  })

  it('bounds failed-job reads and continues cleanup past an unsettled response', async () => {
    await openaiBackgroundResponsesWorkConfig.waitForInitialization()
    const restoreLimit = overrideDynamicConfigFieldsForTest(openaiBackgroundResponsesWorkConfig, {
      reconcile_batch_size: 1,
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
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
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
      await queue.add('report-judgement', { backgroundResponses: [response] } as AIAgentJobData, {
        attempts: 1,
        removeOnFail: false,
      })
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
      expect(cancel).toHaveBeenCalled()
    } finally {
      await worker.close(true)
      retrieve.mockRestore()
      cancel.mockRestore()
      await queue.obliterate({ force: true })
      await queue.close()
      restoreLimit()
    }
  })
})
