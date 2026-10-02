import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError } from 'openai'
import type { Job, Worker } from 'glide-mq'
import { StructuredDecisionError } from '@modules/structured-decisions'
import { AI_AGENTS_QUEUE_NAME, CLASSIFIER_RUN_BACKOFF } from '@queues/ai-agents/config'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { classifierRunBackoffMs } from './processors/classifier-run-backoff.mts'
import { createAIAgentsWorker, processAIAgentWorkerJob } from './workers/core.mts'
import { processAIAgent } from './processors.mts'

function makeJob(): Job<AIAgentJobData> {
  return { name: 'report-judgement', data: {} } as Job<AIAgentJobData>
}

// This suite covers worker construction and OpenAI-429 handling, not the spend cap
// (core.spend-cap.test.mts) -- disable it so 'rate-limits on OpenAI 429' below stays a pure unit
// test, with no dependency on live Valkey/Postgres state.
const spendCapDisabled = {
  waitForSpendCapConfig: () => Promise.resolve(),
  getSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 0 }),
}

describe('ai-agents workers', () => {
  const mockProcessAIAgent = vi.fn<() => Promise<unknown>>()
  const mockHandleOpenAIRateLimit = vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>()

  beforeEach(() => {
    vi.clearAllMocks()
    mockHandleOpenAIRateLimit.mockResolvedValue(undefined)
  })

  it('constructs the worker with the queue processor and runtime options', () => {
    const constructed: unknown[] = []
    function CapturingWorker(
      name: string,
      processor: (job: Job<AIAgentJobData>) => unknown,
      options: unknown,
    ): void {
      constructed.push({ name, processor, options })
    }

    const worker = createAIAgentsWorker({
      WorkerCtor: CapturingWorker as unknown as typeof Worker,
      processAIAgent: mockProcessAIAgent as typeof processAIAgent,
      handleOpenAIRateLimit: mockHandleOpenAIRateLimit,
      queueName: AI_AGENTS_QUEUE_NAME,
      connection: { host: 'localhost' } as never,
      prefix: 'test-prefix' as never,
      concurrency: 7,
      openAIRateLimitPerMinute: 42,
      openAITokenLimitPerMinute: 1234,
    })

    expect(worker).toBeInstanceOf(CapturingWorker)
    expect(constructed).toEqual([
      {
        name: AI_AGENTS_QUEUE_NAME,
        processor: expect.any(Function),
        options: {
          connection: { host: 'localhost' },
          prefix: 'test-prefix',
          concurrency: 7,
          limiter: { max: 42, duration: 60_000 },
          tokenLimiter: {
            maxTokens: 1234,
            duration: 60_000,
            scope: 'queue',
          },
          lockDuration: 300_000,
          stalledInterval: 30_000,
          backoffStrategies: { [CLASSIFIER_RUN_BACKOFF.type]: classifierRunBackoffMs },
        },
      },
    ])
  })

  it('rate-limits on OpenAI 429 and passes the worker instance', async () => {
    const rateLimitError = new RateLimitError(429, {}, 'rate limited', new Headers())
    const worker = {
      rateLimit: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Worker
    mockProcessAIAgent.mockRejectedValue(rateLimitError)

    await expect(
      processAIAgentWorkerJob(makeJob(), worker, {
        ...spendCapDisabled,
        processAIAgent: mockProcessAIAgent as typeof processAIAgent,
        handleOpenAIRateLimit: mockHandleOpenAIRateLimit,
      }),
    ).resolves.toBeUndefined()

    expect(mockHandleOpenAIRateLimit).toHaveBeenCalledWith(rateLimitError, worker)
  })

  it('rethrows a provider outage unchanged so the backoff strategy sees its Retry-After', async () => {
    const outage = new StructuredDecisionError('provider-error', 'HTTP 429', 429, {
      failure: { retryClass: 'transient', retryAfterMs: 5 * 60_000 },
    })
    mockProcessAIAgent.mockRejectedValue(outage)
    const rateLimit = vi.fn<() => Promise<void>>()
    const worker = { rateLimit } as unknown as Worker

    const thrown: unknown = await processAIAgentWorkerJob(makeJob(), worker, {
      ...spendCapDisabled,
      processAIAgent: mockProcessAIAgent as typeof processAIAgent,
    }).catch((err: unknown) => err)

    expect(thrown).toBe(outage)
    expect(rateLimit).not.toHaveBeenCalled()
    expect(classifierRunBackoffMs(1, thrown as Error, () => 0)).toBe(5 * 60_000)
  })
})
