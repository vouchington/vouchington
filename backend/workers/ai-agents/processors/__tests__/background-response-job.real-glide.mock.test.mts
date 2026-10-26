import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { Job, Queue, QueueEvents, Worker } from 'glide-mq'
import { Responses } from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { waitForRealGlideEvent } from '@voucha/test-helpers/real-glide-terminal-deadline'
import {
  makeSdkResponse,
  makeSdkTextResponse,
} from '@voucha/test-helpers/modules/openai-utils/responses'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from '../../workers/core.mts'

vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())
const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }

function pendingResponse() {
  return {
    responseId: `resp_${randomUUID()}`,
    agentSlug: `replay-state-${randomUUID()}`,
    communityId: null,
    postId: null,
    createdAt: new Date().toISOString(),
  }
}

describe('AI job replay of provider response states', () => {
  beforeEach(() => vi.stubEnv('OPENAI_API_KEY', 'owned-replay-state-provider-fixture'))
  afterEach(() => vi.unstubAllEnvs())

  it.each(['active', 'provider-unavailable'] as const)(
    'delays a replay with a persisted response when the provider is %s',
    async providerState => {
      const name = `ai_replay_${providerState}_${randomUUID()}`
      const queue = new Queue<AIAgentJobData>(name, connection)
      const events = new QueueEvents(name, { ...connection, lastEventId: '0', blockTimeout: 1_000 })
      const response = pendingResponse()
      const retrieve = vi.spyOn(Responses.prototype, 'retrieve')
      if (providerState === 'active') {
        retrieve.mockResolvedValueOnce(
          makeSdkResponse({ id: response.responseId, status: 'in_progress' }),
        )
      } else {
        retrieve.mockRejectedValueOnce(new Error('provider unavailable during replay'))
      }
      const cancel = vi
        .spyOn(Responses.prototype, 'cancel')
        .mockResolvedValueOnce(makeSdkResponse({ id: response.responseId, status: 'cancelled' }))
      const create = vi.spyOn(Responses.prototype, 'create')
      const worker = new Worker<AIAgentJobData>(
        name,
        (job: Job<AIAgentJobData>) => processAIAgentWorkerJob(job),
        { ...connection, blockTimeout: 1_000 },
      )
      try {
        await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
        const delayed = once(events, 'delay-changed')
        const admitted = await queue.add(
          'story-post',
          { post_id: randomUUID(), backgroundResponses: [response] },
          { removeOnFail: false },
        )
        if (!admitted) throw new Error('Expected an admitted job')
        const [event] = await waitForRealGlideEvent(
          delayed,
          `AI ${providerState} replay ${admitted.id}`,
        )
        expect(event).toMatchObject({ jobId: admitted.id })
        expect(await admitted.getState()).toBe('delayed')
        expect((await queue.getJob(admitted.id))?.data.backgroundResponses).toEqual([response])
        expect(retrieve).toHaveBeenCalledOnce()
        if (providerState === 'active') expect(cancel).toHaveBeenCalledOnce()
        else expect(cancel).not.toHaveBeenCalled()
        expect(create).not.toHaveBeenCalled()
      } finally {
        await worker.close(true)
        await events.close()
        await queue.obliterate({ force: true })
        await queue.close()
        retrieve.mockRestore()
        cancel.mockRestore()
        create.mockRestore()
      }
    },
  )

  it('finishes a previously completed processor after a no-usage response settles', async () => {
    const name = `ai_replay_completed_${randomUUID()}`
    const queue = new Queue<AIAgentJobData>(name, connection)
    const response = pendingResponse()
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
      .mockResolvedValueOnce(
        makeSdkTextResponse('done', { id: response.responseId, usage: undefined }),
      )
    const create = vi.spyOn(Responses.prototype, 'create')
    const completed = Promise.withResolvers<void>()
    const worker = new Worker<AIAgentJobData>(
      name,
      (job: Job<AIAgentJobData>) => processAIAgentWorkerJob(job),
      { ...connection, blockTimeout: 1_000 },
    )
    worker.on('completed', () => completed.resolve())
    worker.on('failed', (_job, err) => completed.reject(err))
    worker.on('error', completed.reject)
    try {
      const admitted = await queue.add(
        'story-post',
        {
          post_id: randomUUID(),
          backgroundResponses: [response],
          backgroundResponseProcessorCompleted: true,
        },
        { removeOnFail: false },
      )
      if (!admitted) throw new Error('Expected an admitted job')
      await waitForRealGlideEvent(completed.promise, `AI completed replay ${admitted.id}`)
      expect((await queue.getJob(admitted.id))?.data.backgroundResponses).toEqual([])
      expect(retrieve).toHaveBeenCalledOnce()
      expect(create).not.toHaveBeenCalled()
    } finally {
      await worker.close(true)
      await queue.obliterate({ force: true })
      await queue.close()
      retrieve.mockRestore()
      create.mockRestore()
    }
  })
})
