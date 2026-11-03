import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError } from 'openai'
import { DelayedError, type Job, type Worker } from 'glide-mq'
import * as glideMq from '@data-stores/valkey-glide-mq'
import { StructuredDecisionError } from '@vouchington/ai/structured-decisions'
import { AI_AGENTS_QUEUE_NAME, CLASSIFIER_RUN_BACKOFF } from '@queues/ai-agents/config'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import {
  disableSpendCapForTest,
  spendCapDelayableJob,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { classifierRunBackoffMs } from './processors/classifier-run-backoff.mts'
import { createAIAgentsWorker, processAIAgentWorkerJob } from './workers/core.mts'
import { processAIAgent } from './processors.mts'

function makeJob() {
  return spendCapDelayableJob('report-judgement', {} as AIAgentJobData)
}

describe('ai-agents workers', () => {
  const mockProcessAIAgent = vi.fn<() => Promise<unknown>>()

  // This suite covers worker construction and OpenAI-429 handling, not the spend cap
  // (core.spend-cap.test.mts) -- disable it so ambient usage on the shared database is ignored.
  beforeEach(async () => {
    vi.clearAllMocks()
    await disableSpendCapForTest()
  })

  it('builds the worker through the factory with a dedicated command client and runtime options', () => {
    vi.stubEnv('OPENAI_RPM', '42')
    vi.stubEnv('OPENAI_TPM', '1234')
    vi.stubEnv('WORKER_CONCURRENCY_AI_AGENTS', '7')
    const factoryWorker = {} as Worker
    // A real worker would start consuming the shared ai_agents queue, so only the factory call is observed.
    const createWorker = vi.spyOn(glideMq, 'createWorker').mockReturnValue(factoryWorker)

    try {
      expect(createAIAgentsWorker()).toBe(factoryWorker)
      expect(createWorker).toHaveBeenCalledExactlyOnceWith(
        AI_AGENTS_QUEUE_NAME,
        expect.any(Function),
        {
          dedicatedCommandClient: true,
          concurrency: 7,
          limiter: { max: 42, duration: 60_000 },
          tokenLimiter: { maxTokens: 1234, duration: 60_000, scope: 'queue' },
          lockDuration: 300_000,
          stalledInterval: 30_000,
          backoffStrategies: { [CLASSIFIER_RUN_BACKOFF.type]: classifierRunBackoffMs },
        },
      )
    } finally {
      createWorker.mockRestore()
      vi.unstubAllEnvs()
    }
  })

  it('defers a job that hit an OpenAI 429 instead of failing the worker', async () => {
    const rateLimitError = new RateLimitError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after': '30' }),
    )
    const job = makeJob()
    mockProcessAIAgent.mockRejectedValue(rateLimitError)

    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      await expect(
        processAIAgentWorkerJob(job, {
          processAIAgent: mockProcessAIAgent as typeof processAIAgent,
        }),
      ).rejects.toThrow(DelayedError)
      expect(job.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 30_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('rethrows a provider outage unchanged so the backoff strategy sees its Retry-After', async () => {
    const outage = new StructuredDecisionError('provider-error', 'HTTP 429', 429, {
      failure: { retryClass: 'transient', retryAfterMs: 5 * 60_000 },
    })
    mockProcessAIAgent.mockRejectedValue(outage)

    const thrown: unknown = await processAIAgentWorkerJob(makeJob() as Job<AIAgentJobData>, {
      processAIAgent: mockProcessAIAgent as typeof processAIAgent,
    }).catch((err: unknown) => err)

    expect(thrown).toBe(outage)
    expect(classifierRunBackoffMs(1, thrown as Error, () => 0)).toBe(5 * 60_000)
  })
})
