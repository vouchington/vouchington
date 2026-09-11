import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import type { Job, Worker } from 'glide-mq'
import { recordAgentResponseUsage } from '@agents/_shared'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import { processAIAgentWorkerJob } from './core.mts'

// A minimal usage-bearing response, shaped like recordAgentResponseUsage's
// RecordAgentResponseUsageParams['response'] (Pick<OpenAIResponse, 'usage' | 'model' |
// 'service_tier'>). No registration -- recordAiUsage runs directly, matching the streaming
// tool loop's un-registered path (record-response-usage.mts:34-38).
function usageResponse(inputTokens: number, outputTokens: number) {
  return {
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    model: 'gpt-5.4-nano',
    service_tier: 'flex' as const,
  }
}

// Every existing test below covers the token-accumulator wiring, not the spend cap
// (core.spend-cap.test.mts) -- disable it so these stay pure unit tests, with no dependency on
// live Valkey/Postgres state.
const spendCapDisabled = {
  waitForOpenAiSpendCapConfig: () => Promise.resolve(),
  getOpenAiSpendCapFields: () => ({ enabled: false, daily_cap_microunits: 0 }),
}

describe('processAIAgentWorkerJob', () => {
  function mockJob(): Job<AIAgentJobData> {
    return {
      data: {} as AIAgentJobData,
      name: 'chat',
      id: randomUUID(),
      reportTokens: vi.fn<(count: number) => Promise<void>>(),
    } as unknown as Job<AIAgentJobData>
  }

  const worker = {} as Worker

  it('reports the summed token count from every recordAgentResponseUsage call the job makes', async () => {
    const job = mockJob()
    const agentSlug = `token-accumulator-test-${randomUUID()}`
    const handleOpenAIRateLimit = vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>()

    const result = await processAIAgentWorkerJob(job, worker, {
      ...spendCapDisabled,
      handleOpenAIRateLimit,
      processAIAgent: async () => {
        // Real recordAgentResponseUsage (the plan's single choke point), not a mock -- this is
        // what proves the wiring survives, not just a direct addAccumulatedTokens() call.
        await recordAgentResponseUsage({ response: usageResponse(100, 20), agentSlug })
        await recordAgentResponseUsage({ response: usageResponse(50, 5), agentSlug })
        return 'ok'
      },
    })

    expect(result).toBe('ok')
    expect(job.reportTokens).toHaveBeenCalledExactlyOnceWith(175)
    expect(handleOpenAIRateLimit).not.toHaveBeenCalled()
  })

  it('does not call reportTokens when the job consumes no tokens', async () => {
    const job = mockJob()

    await processAIAgentWorkerJob(job, worker, {
      ...spendCapDisabled,
      handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
      processAIAgent: async () => 'ok',
    })

    expect(job.reportTokens).not.toHaveBeenCalled()
  })

  it('still reports accumulated tokens when the job throws, then hands the error to handleOpenAIRateLimit', async () => {
    const job = mockJob()
    const agentSlug = `token-accumulator-test-${randomUUID()}`
    const thrown = new Error('boom')
    const handleOpenAIRateLimit = vi
      .fn<(error: unknown, worker: Worker) => Promise<unknown>>()
      .mockResolvedValue('handled')

    const result = await processAIAgentWorkerJob(job, worker, {
      ...spendCapDisabled,
      handleOpenAIRateLimit,
      processAIAgent: async () => {
        await recordAgentResponseUsage({ response: usageResponse(30, 10), agentSlug })
        throw thrown
      },
    })

    expect(result).toBe('handled')
    expect(job.reportTokens).toHaveBeenCalledExactlyOnceWith(40)
    expect(handleOpenAIRateLimit).toHaveBeenCalledExactlyOnceWith(thrown, worker)
  })

  it("hands processAIAgent's original error to handleOpenAIRateLimit even when reportTokens rejects", async () => {
    const job = mockJob()
    const agentSlug = `token-accumulator-test-${randomUUID()}`
    const thrownByProcessAIAgent = new Error('openai rate limited')
    job.reportTokens = vi
      .fn<(count: number) => Promise<void>>()
      .mockRejectedValue(new Error('reportTokens Valkey blip'))
    const handleOpenAIRateLimit = vi
      .fn<(error: unknown, worker: Worker) => Promise<unknown>>()
      .mockResolvedValue('handled')

    // Without the accumulator catching reportTokens' rejection, that rejection would replace
    // thrownByProcessAIAgent, so handleOpenAIRateLimit would never see the real OpenAI error and
    // the queue would never pause on an actual 429.
    const result = await processAIAgentWorkerJob(job, worker, {
      ...spendCapDisabled,
      handleOpenAIRateLimit,
      processAIAgent: async () => {
        await recordAgentResponseUsage({ response: usageResponse(30, 10), agentSlug })
        throw thrownByProcessAIAgent
      },
    })

    expect(result).toBe('handled')
    expect(handleOpenAIRateLimit).toHaveBeenCalledExactlyOnceWith(thrownByProcessAIAgent, worker)
  })

  it('isolates concurrent jobs -- one job never sees another job in-flight on the same worker', async () => {
    const jobA = mockJob()
    const jobB = mockJob()
    const agentSlug = `token-accumulator-test-${randomUUID()}`
    const firstJobRecordedUsage = Promise.withResolvers<void>()
    const releaseFirstJob = Promise.withResolvers<void>()

    await Promise.all([
      processAIAgentWorkerJob(jobA, worker, {
        ...spendCapDisabled,
        handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
        processAIAgent: async () => {
          await recordAgentResponseUsage({ response: usageResponse(1000, 1000), agentSlug })
          firstJobRecordedUsage.resolve()
          await releaseFirstJob.promise
          await recordAgentResponseUsage({ response: usageResponse(1, 1), agentSlug })
          return 'a'
        },
      }),
      processAIAgentWorkerJob(jobB, worker, {
        ...spendCapDisabled,
        handleOpenAIRateLimit: vi.fn<(error: unknown, worker: Worker) => Promise<unknown>>(),
        processAIAgent: async () => {
          await firstJobRecordedUsage.promise
          try {
            await recordAgentResponseUsage({ response: usageResponse(7, 0), agentSlug })
          } finally {
            releaseFirstJob.resolve()
          }
          return 'b'
        },
      }),
    ])

    // If the accumulator leaked across jobs instead of scoping per-job via AsyncLocalStorage,
    // jobA's slower total would bleed into jobB's reportTokens call (or vice versa).
    expect(jobA.reportTokens).toHaveBeenCalledExactlyOnceWith(2002)
    expect(jobB.reportTokens).toHaveBeenCalledExactlyOnceWith(7)
  })
})
