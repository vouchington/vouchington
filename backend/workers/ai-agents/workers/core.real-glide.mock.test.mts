import { once } from 'node:events'
import { randomUUID } from 'node:crypto'
import { RateLimitError } from 'openai'
import { Queue, QueueEvents, Worker, type Job } from 'glide-mq'
import { describe, expect, it, vi } from 'vitest'
import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { ModelProviderError } from '@modules/model-providers/errors'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

// This project deliberately restores real GlideMQ instead of the default in-memory worker shim.
vi.mock<typeof import('glide-mq')>(import('glide-mq'), async importOriginal => importOriginal())

const connection = { connection: workerQueueConnection, prefix: workerQueuePrefix }
const JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
const spendCapDisabled = {
  waitForSpendCapConfig: () => Promise.resolve(),
  getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 0 }),
}

describe('ai_agents provider rate limits with real GlideMQ', () => {
  it.each([
    [
      'an OpenAI 429 with Retry-After',
      () => new RateLimitError(429, {}, 'rate limited', new Headers({ 'retry-after': '30' })),
      30_000,
    ],
    [
      'a model provider rate limit',
      () =>
        new ModelProviderError('rate-limited', 'rate limited', {
          retryClass: 'transient',
          retryAfterMs: 20_000,
          status: 429,
        }),
      20_000,
    ],
  ])(
    'parks only the job that hit %s and keeps running provider-free jobs',
    async (_name, createFailure, waitMs) => {
      const queueName = `ai_agents_rate_limit_${randomUUID()}`
      const queue = new Queue<AIAgentJobData>(queueName, connection)
      const events = new QueueEvents(queueName, {
        ...connection,
        lastEventId: '0',
        blockTimeout: 1_000,
      })
      const reconciled = Promise.withResolvers<void>()
      // A limiter, as on the production queue (OPENAI_RPM per minute; wider here so the test does
      // not rate-limit itself): it is what lets a worker-level pause hold back every other job.
      const worker = new Worker<AIAgentJobData>(
        queueName,
        (job: Job<AIAgentJobData>) =>
          processAIAgentWorkerJob(job, {} as Worker, {
            ...spendCapDisabled,
            processAIAgent: async providerJob => {
              if (providerJob.name === 'report-judgement') throw createFailure()
              reconciled.resolve()
              return 'reconciled'
            },
          }),
        { ...connection, blockTimeout: 1_000, limiter: { max: 100, duration: 1_000 } },
      )
      try {
        await Promise.all([events.waitUntilReady(), worker.waitUntilReady()])
        const delayed = once(events, 'delay-changed')
        const providerJob = await queue.add('report-judgement', {} as AIAgentJobData, JOB_OPTIONS)
        if (!providerJob) throw new Error('Expected the provider job')

        const [event] = await delayed

        const delayMs = Number((event as { delay: string }).delay)
        expect(delayMs).toBeGreaterThan(waitMs - 1_000)
        expect(delayMs).toBeLessThanOrEqual(waitMs)
        const stored = await queue.getJob(providerJob.id)
        expect(await stored?.getState()).toBe('delayed')
        expect(stored?.attemptsMade).toBe(0)

        await queue.add('reconcile-background-responses', {} as AIAgentJobData, JOB_OPTIONS)
        await reconciled.promise
      } finally {
        await Promise.all([worker.close(true), events.close()])
        await queue.obliterate({ force: true })
        await queue.close()
      }
    },
  )
})
