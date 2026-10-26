import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  PAGED_DISPATCHER_MAX_STALLED_COUNT,
  withPagedDispatcherStallBudget,
} from '@data-stores/valkey-glide-mq/worker-stall-budget'
import { findAiUsageRecordForAgent } from '@voucha/test-helpers'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { retrieveOpenAIResponse } from '@modules/openai-utils/create-response'
import { makeSdkTextResponse } from '@voucha/test-helpers/modules/openai-utils/responses'
import type { AIAgentJobData, ReconcileBackgroundResponsesJobData } from '@queues/ai-agents/types'
import { processReconcileBackgroundResponses } from './process-reconcile-background-responses.mts'
import { processAIAgentWorkerJob } from '../workers/core.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    retrieveOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const spendCapDisabled = {
  waitForSpendCapConfig: () => Promise.resolve(),
  getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 0 }),
}

function pendingResponse() {
  return {
    responseId: `resp_${randomUUID()}`,
    agentSlug: `stalled-agent-${randomUUID()}`,
    communityId: null,
    postId: null,
    createdAt: new Date().toISOString(),
  }
}

function completedResponse(id: string) {
  return makeSdkTextResponse('done', {
    id,
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
}

describe('AI background response recovery with real GlideMQ', () => {
  it('settles a persisted response before a replayed processor and deduplicates the job id', async () => {
    const name = `ai_response_replay_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const response = pendingResponse()
    const data = { backgroundResponses: [response] } as AIAgentJobData
    const jobId = `report_${randomUUID()}`
    const admitted = await queue.add('report-judgement', data, { jobId, removeOnFail: false })
    if (!admitted) throw new Error('Expected an admitted job')
    await expect(queue.add('report-judgement', data, { jobId })).resolves.toBeNull()
    vi.mocked(retrieveOpenAIResponse).mockReset()
    vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(completedResponse(response.responseId))
    const completed = Promise.withResolvers<void>()
    const process = vi.fn<() => Promise<void>>(async () => {
      const ledger = await findAiUsageRecordForAgent(response.agentSlug, {
        inputTokens: 13,
        outputTokens: 5,
      })
      expect(ledger).not.toBeNull()
    })
    const worker = new Worker<AIAgentJobData>(
      name,
      (job: Job<AIAgentJobData>) =>
        processAIAgentWorkerJob(job, { ...spendCapDisabled, processAIAgent: process }),
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('completed', finished => {
      if (finished.id === admitted.id) completed.resolve()
    })
    worker.on('failed', (_job, error) => completed.reject(error))
    worker.on('error', completed.reject)
    try {
      await waitForRealGlideEvent(completed.promise, `AI recovery ${admitted.id}`)
      expect(process).toHaveBeenCalledOnce()
      expect((await queue.getJob(admitted.id))?.data.backgroundResponses).toEqual([])
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('retains a terminal-stalled job and reconciles its response without running its processor', async () => {
    const name = `ai_response_terminal_stall_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const response = pendingResponse()
    const admitted = await queue.add(
      'report-judgement',
      { backgroundResponses: [response] } as AIAgentJobData,
      { attempts: 1, removeOnFail: false },
    )
    if (!admitted) throw new Error('Expected an admitted job')
    const client = await queue.getClient()
    await client.hset(`${workerQueuePrefix ?? 'glide'}:{${name}}:job:${admitted.id}`, {
      stalledCount: '3',
    })
    const failed = Promise.withResolvers<void>()
    const process = vi.fn<() => Promise<void>>(async () => undefined)
    const worker = new Worker<AIAgentJobData>(
      name,
      withPagedDispatcherStallBudget<AIAgentJobData, unknown>(name, (job: Job<AIAgentJobData>) =>
        processAIAgentWorkerJob(job, { ...spendCapDisabled, processAIAgent: process }),
      ),
      { ...connection, maxStalledCount: PAGED_DISPATCHER_MAX_STALLED_COUNT, blockTimeout: 1_000 },
    )
    worker.on('failed', failedJob => {
      if (failedJob?.id === admitted.id) failed.resolve()
    })
    worker.on('completed', completedJob => {
      if (completedJob.id === admitted.id)
        failed.reject(new Error('Stalled job unexpectedly completed'))
    })
    worker.on('error', failed.reject)
    try {
      await waitForRealGlideEvent(failed.promise, `AI terminal stall ${admitted.id}`)
      expect(process).not.toHaveBeenCalled()
    } finally {
      await worker.close(true)
    }
    try {
      const stored = await queue.getJob(admitted.id)
      expect(await stored?.getState()).toBe('failed')
      expect(stored?.data.backgroundResponses).toEqual([response])
      vi.mocked(retrieveOpenAIResponse).mockReset()
      vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
        completedResponse(response.responseId),
      )
      const sweep = await queue.add('reconcile-background-responses', {
        phase: 'failed',
        failedOffset: 0,
        sweepId: randomUUID(),
        page: 0,
      })
      if (!sweep) throw new Error('Expected a sweep job')
      await processReconcileBackgroundResponses(sweep as Job<ReconcileBackgroundResponsesJobData>, {
        queue,
        enqueuePage: data => queue.add('reconcile-background-responses', data),
      })
      await expect(
        findAiUsageRecordForAgent(response.agentSlug, { inputTokens: 13, outputTokens: 5 }),
      ).resolves.not.toBeNull()
      expect((await queue.getJob(admitted.id))?.data.backgroundResponses).toEqual([response])
      expect(retrieveOpenAIResponse).toHaveBeenCalledOnce()
      const cleanup = await queue.add('reconcile-background-responses', {
        phase: 'cleanup',
        failedOffset: 0,
        sweepId: randomUUID(),
        page: 1,
      })
      if (!cleanup) throw new Error('Expected a cleanup job')
      await processReconcileBackgroundResponses(
        cleanup as Job<ReconcileBackgroundResponsesJobData>,
        {
          queue,
          enqueuePage: data => queue.add('reconcile-background-responses', data),
          failedJobVisibilityCount: 0,
        },
      )
      await expect(queue.getJob(admitted.id)).resolves.toBeNull()
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
