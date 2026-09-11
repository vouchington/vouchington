import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError } from 'openai'
import type { Job, Worker } from 'glide-mq'
import { AI_AGENTS_QUEUE_NAME } from '@queues/ai-agents/config'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { createAIAgentsWorker, processAIAgentWorkerJob } from './workers/core.mts'
import { processAIAgent } from './processors.mts'

function makeJob(): Job<AIAgentJobData> {
  return { name: 'chat', data: {} } as Job<AIAgentJobData>
}

// This suite covers worker construction and OpenAI-429 handling, not the spend cap
// (core.spend-cap.test.mts) -- disable it so 'rate-limits on OpenAI 429' below stays a pure unit
// test, with no dependency on live Valkey/Postgres state.
const spendCapDisabled = {
  waitForOpenAiSpendCapConfig: () => Promise.resolve(),
  getOpenAiSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 0 }),
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
    class CapturingWorker<T> {
      constructor(name: string, processor: (job: Job<T>) => unknown, options: unknown) {
        constructed.push({ name, processor, options })
      }
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
})
