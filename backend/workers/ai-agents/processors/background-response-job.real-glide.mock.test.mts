import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { randomUUID } from 'node:crypto'
import { Queue, Worker, type Job } from 'glide-mq'
import { Stream } from 'openai/core/streaming'
import {
  Responses,
  type Response,
  type ResponseStreamEvent,
} from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import {
  PAGED_DISPATCHER_MAX_STALLED_COUNT,
  withPagedDispatcherStallBudget,
} from '@data-stores/valkey-glide-mq/worker-stall-budget'
import { findAiUsageRecordForAgent } from '@voucha/test-helpers'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users-direct'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { insertTestPostStory } from '@voucha/test-helpers/entities/post-stories'
import { insertTestStory } from '@voucha/test-helpers/entities/stories'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import {
  makeSdkResponse,
  makeSdkTextResponse,
  makeStreamEvent,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import type { AIAgentJobData, ReconcileBackgroundResponsesJobData } from '@queues/ai-agents/types'
import {
  modelRoutingConfig,
  spendCapConfig,
  getAccountingUncertaintySource,
} from '@services/ai-usage'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { processReconcileBackgroundResponses } from './process-reconcile-background-responses.mts'
import { processAIAgentWorkerJob } from '../workers/core.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
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

describe('AI background response recovery with real GlideMQ', () => {
  beforeEach(() => {
    vi.stubEnv('OPENAI_API_KEY', 'owned-story-provider-fixture')
    vi.stubEnv(
      'VOUCHA_STORED_SECRET_ENCRYPTION_KEYS',
      'test:raw32:this fake test key is not secret',
    )
  })
  afterEach(() => vi.unstubAllEnvs())

  it('drops a terminal response ID with unknown usage before a completed processor exits', async () => {
    await withReservedAiUsageDay(1_000_000, async day => {
      const name = `ai_terminal_no_usage_${randomUUID()}`
      const queue = new Queue<AIAgentJobData>(name, connection)
      const response = {
        ...pendingResponse(),
        createdAt: new Date(`${day}T12:00:00Z`).toISOString(),
      }
      const job = await queue.add(
        'story-post',
        {
          post_id: randomUUID(),
          backgroundResponses: [response],
          backgroundResponseProcessorCompleted: true,
        },
        { removeOnFail: false },
      )
      if (!job) throw new Error('Expected a recovery job')
      const retrieve = vi.spyOn(Responses.prototype, 'retrieve').mockResolvedValueOnce(
        makeSdkResponse({
          id: response.responseId,
          status: 'failed',
          usage: null as unknown as Response['usage'],
        }),
      )
      const create = vi.spyOn(Responses.prototype, 'create')
      try {
        await expect(getAccountingUncertaintySource(day)).resolves.toBeNull()
        await expect(processAIAgentWorkerJob(job)).resolves.toBeUndefined()
        await expect(getAccountingUncertaintySource(day)).resolves.toBe('unknown_billed_attempt')
        expect((await queue.getJob(job.id))?.data.backgroundResponses).toEqual([])
        expect(create).not.toHaveBeenCalled()
      } finally {
        retrieve.mockRestore()
        create.mockRestore()
        await queue.obliterate({ force: true })
        await queue.close()
      }
    })
  })

  it('settles a persisted response before a replayed processor and deduplicates the job id', async () => {
    await Promise.all([
      spendCapConfig.waitForInitialization(),
      modelRoutingConfig.waitForInitialization(),
    ])
    const restoreSpendCap = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
    const restoreRouting = overrideDynamicConfigFieldsForTest(modelRoutingConfig, {
      openai_transport: 'direct',
      story_post_provider: 'openai',
      story_post_model: 'gpt-6-luna',
    })
    const owner = await createTestUserDirect()
    const story = await insertTestStory({ title: `Recovery story ${randomUUID()}` })
    const postId = await insertTestPost({
      title: story.title ?? 'Recovery story',
      slug: `recovery-story-${randomUUID()}`,
      createdById: owner.id,
      markdown: '',
      postType: 'story',
    })
    await insertTestPostStory(postId, story.id, owner.id)
    const name = `ai_response_replay_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const response = pendingResponse()
    const data: AIAgentJobData = { post_id: postId, force: false, backgroundResponses: [response] }
    const jobId = `report_${randomUUID()}`
    const admitted = await queue.add('story-post', data, { jobId, removeOnFail: false })
    if (!admitted) throw new Error('Expected an admitted job')
    await expect(queue.add('story-post', data, { jobId })).resolves.toBeNull()
    const retrieve = vi.spyOn(Responses.prototype, 'retrieve')
    retrieve.mockResolvedValueOnce(completedResponse(response.responseId))
    const create = vi.spyOn(Responses.prototype, 'create')
    let recordedBeforeCreate = false
    const nextResponse = makeSdkTextResponse(
      JSON.stringify({ title: 'Recovered story', ai_summary_markdown: 'Recovered summary.' }),
      { id: `resp_${randomUUID()}`, model: 'gpt-6-luna-2026-10-01', service_tier: 'flex' },
    )
    const controller = new AbortController()
    async function* providerEvents(): AsyncGenerator<ResponseStreamEvent> {
      yield makeStreamEvent({
        type: 'response.created',
        sequence_number: 1,
        response: makeSdkResponse({
          ...nextResponse,
          status: 'in_progress',
          output: [],
          output_text: '',
        }),
      })
      yield makeStreamEvent({
        type: 'response.completed',
        sequence_number: 2,
        response: nextResponse,
      })
    }
    create.mockImplementation(
      () =>
        Promise.resolve().then(async () => {
          const ledger = await findAiUsageRecordForAgent(response.agentSlug, {
            inputTokens: 13,
            outputTokens: 5,
          })
          recordedBeforeCreate = ledger !== null
          return new Stream<ResponseStreamEvent>(providerEvents, controller)
        }) as unknown as ReturnType<typeof Responses.prototype.create>,
    )
    const completed = Promise.withResolvers<void>()
    const worker = new Worker<AIAgentJobData>(
      name,
      (job: Job<AIAgentJobData>) => processAIAgentWorkerJob(job),
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('completed', finished => {
      if (finished.id === admitted.id) completed.resolve()
    })
    worker.on('failed', (failedJob, error) => {
      if (failedJob?.id === admitted.id) completed.reject(error)
    })
    worker.on('error', completed.reject)
    try {
      await waitForRealGlideEvent(completed.promise, `AI recovery ${admitted.id}`)
      expect(create).toHaveBeenCalledOnce()
      expect(recordedBeforeCreate).toBe(true)
      expect(retrieve).toHaveBeenCalledOnce()
      expect((await queue.getJob(admitted.id))?.data.backgroundResponses).toEqual([])
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
      create.mockRestore()
      retrieve.mockRestore()
      restoreRouting()
      restoreSpendCap()
      controller.abort()
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
    const create = vi.spyOn(Responses.prototype, 'create')
    create.mockRejectedValue(new Error('Unexpected paid provider call after terminal stall'))
    const worker = new Worker<AIAgentJobData>(
      name,
      withPagedDispatcherStallBudget<AIAgentJobData, unknown>(name, (job: Job<AIAgentJobData>) =>
        processAIAgentWorkerJob(job),
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
      expect(create).not.toHaveBeenCalled()
    } finally {
      await worker.close(true)
    }
    try {
      const stored = await queue.getJob(admitted.id)
      expect(await stored?.getState()).toBe('failed')
      expect(stored?.data.backgroundResponses).toEqual([response])
      const retrieve = vi.spyOn(Responses.prototype, 'retrieve')
      retrieve.mockResolvedValueOnce(completedResponse(response.responseId))
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
      expect(retrieve).toHaveBeenCalledOnce()
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
      retrieve.mockRestore()
    } finally {
      await queue.obliterate({ force: true })
      await queue.close()
      create.mockRestore()
    }
  })
})
