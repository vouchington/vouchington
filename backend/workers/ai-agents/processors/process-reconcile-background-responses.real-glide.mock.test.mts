import { randomUUID } from 'node:crypto'
import { Queue, Worker, UnrecoverableError, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import { findAiUsageRecordForAgent } from '@voucha/test-helpers'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import { retrieveOpenAIResponse } from '@modules/openai-utils/create-response'
import { makeSdkTextResponse } from '@voucha/test-helpers/modules/openai-utils/responses'
import type { AIAgentJobData, ReconcileBackgroundResponsesJobData } from '@queues/ai-agents/types'
import { failedAiJobHasNoPendingResponses } from '@queues/ai-agents/enqueues/failed-job-recovery'
import { processReconcileBackgroundResponses } from './process-reconcile-background-responses.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    retrieveOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

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

describe('retained AI response sweeps with real GlideMQ', () => {
  it('prunes a retained failed job whose completed response has no usage', async () => {
    const name = `ai_response_no_usage_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const response = pendingResponse()
    const admitted = await queue.add(
      'report-judgement',
      { backgroundResponses: [response] } as AIAgentJobData,
      { attempts: 1, removeOnFail: false },
    )
    if (!admitted) throw new Error('Expected an admitted job')
    const failed = Promise.withResolvers<void>()
    const worker = new Worker<AIAgentJobData>(
      name,
      async () => {
        throw new UnrecoverableError('test terminal failure')
      },
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('failed', failedJob => {
      if (failedJob?.id === admitted.id) failed.resolve()
    })
    worker.on('error', failed.reject)
    try {
      await waitForRealGlideEvent(failed.promise, `AI no-usage failure ${admitted.id}`)
    } finally {
      await worker.close(true)
    }
    try {
      vi.mocked(retrieveOpenAIResponse).mockReset()
      vi.mocked(retrieveOpenAIResponse).mockResolvedValue(
        makeSdkTextResponse('done', { id: response.responseId, usage: undefined }),
      )
      const cleanup = await queue.add('reconcile-background-responses', {
        phase: 'cleanup',
        failedOffset: 0,
        sweepId: randomUUID(),
        page: 0,
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
      await expect(
        findAiUsageRecordForAgent(response.agentSlug, { inputTokens: 0, outputTokens: 0 }),
      ).resolves.toBeNull()
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })

  it('releases a failed classifier identity after accounting for its retained response', async () => {
    const name = `ai_classifier_recovery_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const response = pendingResponse()
    const jobId = `classifier_run_${randomUUID()}`
    const first = await queue.add(
      'classifier-run',
      { backgroundResponses: [response] } as AIAgentJobData,
      { jobId, attempts: 1, removeOnFail: false },
    )
    if (!first) throw new Error('Expected first classifier job')
    const failed = Promise.withResolvers<void>()
    const worker = new Worker<AIAgentJobData>(
      name,
      async () => {
        throw new UnrecoverableError('test terminal failure')
      },
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('failed', failedJob => {
      if (failedJob?.id === jobId) failed.resolve()
    })
    worker.on('error', failed.reject)
    try {
      await waitForRealGlideEvent(failed.promise, `classifier failure ${jobId}`)
    } finally {
      await worker.close(true)
    }
    try {
      vi.mocked(retrieveOpenAIResponse).mockReset()
      vi.mocked(retrieveOpenAIResponse).mockResolvedValueOnce(
        completedResponse(response.responseId),
      )
      const blocked = await enqueueBulkReactivatingFinished({
        queue,
        inputs: [jobId],
        jobIdOf: id => id,
        enqueueBulk: async ids =>
          Promise.all(
            ids.map(id => queue.add('classifier-run', {} as AIAgentJobData, { jobId: id })),
          ).then(jobs => jobs.filter((job): job is NonNullable<typeof job> => job !== null)),
        canRemoveFailed: failedAiJobHasNoPendingResponses,
      })
      expect(blocked).toEqual([])
      const sweep = await queue.add('reconcile-background-responses', {
        phase: 'failed',
        failedOffset: 0,
        sweepId: randomUUID(),
        page: 0,
      })
      if (!sweep) throw new Error('Expected sweep job')
      await processReconcileBackgroundResponses(sweep as Job<ReconcileBackgroundResponsesJobData>, {
        queue,
        enqueuePage: data => queue.add('reconcile-background-responses', data),
      })
      await expect(
        findAiUsageRecordForAgent(response.agentSlug, { inputTokens: 13, outputTokens: 5 }),
      ).resolves.not.toBeNull()
      await expect(queue.getJob(jobId)).resolves.toBeNull()
      const replay = await enqueueBulkReactivatingFinished({
        queue,
        inputs: [jobId],
        jobIdOf: id => id,
        enqueueBulk: async ids =>
          Promise.all(
            ids.map(id => queue.add('classifier-run', {} as AIAgentJobData, { jobId: id })),
          ).then(jobs => jobs.filter((job): job is NonNullable<typeof job> => job !== null)),
        canRemoveFailed: failedAiJobHasNoPendingResponses,
      })
      expect(replay).toHaveLength(1)
      expect(replay[0]?.data.backgroundResponses).toBeUndefined()
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
    }
  })
})
