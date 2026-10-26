import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Job, Queue, QueueEvents, Worker } from 'glide-mq'
import { Responses } from 'openai/resources/responses/responses'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { ai_agents } from '@queues/ai-agents/queues'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import {
  backgroundResponseRecoveryJobId,
  BACKGROUND_RESPONSE_RECOVERY_DELAY_MS,
} from '@queues/ai-agents/enqueues/recover-background-response'
import { createBackgroundResponseRegistrationHooks } from '@agents/_shared/record-response-background-hooks'
import { countAiUsageRecordsForResponseId } from '@voucha/test-helpers'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import { processAIAgentWorkerJob } from '../../workers/core.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

describe('inline response delayed recovery', () => {
  it('observes a live inline response, then records its usage after the recovery job is promoted', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'inline-observe-provider-fixture')
    const name = `ai_inline_observe_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const events = new QueueEvents(name, { ...connection, lastEventId: '0', blockTimeout: 1_000 })
    const response = {
      responseId: `resp_${randomUUID()}`,
      agentSlug: `inline-observe-${randomUUID()}`,
      communityId: null,
      postId: null,
      createdAt: new Date().toISOString(),
    }
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
      .mockResolvedValueOnce(makeSdkResponse({ id: response.responseId, status: 'in_progress' }))
      .mockResolvedValueOnce(
        makeSdkTextResponse('finished title', {
          id: response.responseId,
          model: 'gpt-6-luna-2026-10-01',
          service_tier: 'flex',
        }),
      )
    const cancel = vi
      .spyOn(Responses.prototype, 'cancel')
      .mockResolvedValue(makeSdkResponse({ id: response.responseId, status: 'cancelled' }))
    const generate = vi
      .spyOn(Responses.prototype, 'create')
      .mockRejectedValue(new Error('Recovery must not generate a second response'))
    const completed = Promise.withResolvers<void>()
    const worker = new Worker<AIAgentJobData>(
      name,
      (job: Job<AIAgentJobData>) => processAIAgentWorkerJob(job),
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('completed', job => {
      if (job.name === 'recover-background-response') completed.resolve()
    })
    worker.on('failed', (job, err) => {
      if (job?.name === 'recover-background-response') completed.reject(err)
    })
    worker.on('error', completed.reject)
    try {
      await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
      const delayed = once(events, 'delay-changed')
      const job = await queue.add(
        'recover-background-response',
        { backgroundResponses: [response], backgroundResponseProcessorCompleted: true },
        { attempts: 1, removeOnComplete: false, removeOnFail: false },
      )
      if (!job) throw new Error('Expected recovery job')
      const [event] = await waitForRealGlideEvent(delayed, `Inline recovery delay ${job.id}`)
      expect(event).toMatchObject({ jobId: job.id })
      await expect(job.getState()).resolves.toBe('delayed')
      expect((await queue.getJob(job.id))?.data.backgroundResponses).toEqual([response])
      expect(cancel).not.toHaveBeenCalled()
      expect(generate).not.toHaveBeenCalled()
      await expect(countAiUsageRecordsForResponseId(response.responseId)).resolves.toBe(0)

      await job.promote()
      await waitForRealGlideEvent(completed.promise, `Inline recovery completion ${job.id}`)
      expect((await queue.getJob(job.id))?.data.backgroundResponses).toEqual([])
      await expect(countAiUsageRecordsForResponseId(response.responseId)).resolves.toBe(1)
      expect(retrieve).toHaveBeenCalledTimes(2)
      expect(cancel).not.toHaveBeenCalled()
      expect(generate).not.toHaveBeenCalled()
    } finally {
      await worker.close(true)
      await events.close()
      await queue.obliterate({ force: true })
      await queue.close()
      retrieve.mockRestore()
      cancel.mockRestore()
      generate.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('deduplicates response-created admissions and settles an abandoned inline call without generating', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'inline-recovery-provider-fixture')
    const responseId = `resp_${randomUUID()}`
    const hooks = createBackgroundResponseRegistrationHooks({
      agentSlug: `inline-crash-${randomUUID()}`,
      createdAt: new Date(),
    })
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
      .mockResolvedValue(
        makeSdkTextResponse('abandoned title', { id: responseId, model: 'gpt-6-luna' }),
      )
    const generate = vi.spyOn(Responses.prototype, 'create')
    try {
      // The request stops immediately after response.created, before normal usage settlement.
      await hooks.hooks.onResponseCreated(responseId)
      await hooks.hooks.onResponseCreated(responseId)
      const job = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
      if (!job) throw new Error('Missing admitted recovery job')
      expect(job.name).toBe('recover-background-response')
      await expect(job.getState()).resolves.toBe('delayed')
      expect(job.opts.delay).toBe(BACKGROUND_RESPONSE_RECOVERY_DELAY_MS)
      expect(job.opts.ordering).toMatchObject({ key: 'ai_background_response_recovery' })
      expect(job.data.backgroundResponses).toHaveLength(1)
      expect(job.data.backgroundResponseProcessorCompleted).toBe(true)
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(0)

      // Execute the actual worker entry point with the persisted native Glide job.
      await processAIAgentWorkerJob(job)
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
      const settled = await ai_agents.getJob(job.id)
      expect(settled?.data.backgroundResponses).toEqual([])
      if (!settled) throw new Error('Missing settled native job')
      await processAIAgentWorkerJob(settled)
      expect(retrieve).toHaveBeenCalledTimes(1)
      expect(generate).not.toHaveBeenCalled()
      await expect(countAiUsageRecordsForResponseId(responseId)).resolves.toBe(1)
    } finally {
      const job = await ai_agents.getJob(backgroundResponseRecoveryJobId(responseId))
      if (job) await job.remove()
      retrieve.mockRestore()
      generate.mockRestore()
      vi.unstubAllEnvs()
    }
  })
})
