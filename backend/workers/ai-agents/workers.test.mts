import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError } from 'openai'
import type { Job, Worker } from 'glide-mq'
import type { createWorker } from '@data-stores/valkey-glide-mq'
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
  const mockHandleOpenAIRateLimit =
    vi.fn<(error: unknown, job: Job<AIAgentJobData>) => Promise<unknown>>()

  beforeEach(() => {
    vi.clearAllMocks()
    mockHandleOpenAIRateLimit.mockResolvedValue(undefined)
  })

  it('builds the worker through the factory with a dedicated command client and runtime options', () => {
    const created: unknown[] = []
    const factoryWorker = {} as Worker
    const createWorkerStub = ((
      name: string,
      processor: (job: Job<AIAgentJobData>) => unknown,
      options: unknown,
    ) => {
      created.push({ name, processor, options })
      return factoryWorker
    }) as unknown as typeof createWorker

    const worker = createAIAgentsWorker({
      createWorker: createWorkerStub,
      processAIAgent: mockProcessAIAgent as typeof processAIAgent,
      handleOpenAIRateLimit: mockHandleOpenAIRateLimit,
      queueName: AI_AGENTS_QUEUE_NAME,
      concurrency: 7,
      openAIRateLimitPerMinute: 42,
      openAITokenLimitPerMinute: 1234,
    })

    expect(worker).toBe(factoryWorker)
    expect(created).toEqual([
      {
        name: AI_AGENTS_QUEUE_NAME,
        processor: expect.any(Function),
        options: {
          dedicatedCommandClient: true,
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

  it('hands an OpenAI 429 to the rate-limit handler with the job, not the worker', async () => {
    const rateLimitError = new RateLimitError(429, {}, 'rate limited', new Headers())
    const job = makeJob()
    mockProcessAIAgent.mockRejectedValue(rateLimitError)

    await expect(
      processAIAgentWorkerJob(job, {
        ...spendCapDisabled,
        processAIAgent: mockProcessAIAgent as typeof processAIAgent,
        handleOpenAIRateLimit: mockHandleOpenAIRateLimit,
      }),
    ).resolves.toBeUndefined()

    expect(mockHandleOpenAIRateLimit).toHaveBeenCalledWith(rateLimitError, job)
  })

  it('rethrows a provider outage unchanged so the backoff strategy sees its Retry-After', async () => {
    const outage = new StructuredDecisionError('provider-error', 'HTTP 429', 429, {
      failure: { retryClass: 'transient', retryAfterMs: 5 * 60_000 },
    })
    mockProcessAIAgent.mockRejectedValue(outage)

    const thrown: unknown = await processAIAgentWorkerJob(makeJob(), {
      ...spendCapDisabled,
      processAIAgent: mockProcessAIAgent as typeof processAIAgent,
    }).catch((err: unknown) => err)

    expect(thrown).toBe(outage)
    expect(classifierRunBackoffMs(1, thrown as Error, () => 0)).toBe(5 * 60_000)
  })
})
