import { randomUUID } from 'node:crypto'
import { APIError, RateLimitError } from 'openai'
import { Responses } from 'openai/resources/responses/responses'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DelayedError, type Job } from 'glide-mq'
import { recordAgentResponseUsage } from '@agents/_shared'
import { ModelProviderError } from '@vouchington/ai/providers'
import { UnrecoverableError } from '@vouchington/queue-errors'
import type { AIAgentJobData } from '@queues/ai-agents/types'
import {
  disableSpendCapForTest,
  spendCapDelayableJob,
} from '@voucha/test-helpers/ai-agents-spend-cap'
import { processAIAgentWorkerJob } from './core.mts'

// A minimal usage-bearing response, shaped like recordAgentResponseUsage's
// RecordAgentResponseUsageParams['response'] (Pick<OpenAIResponse, 'usage' | 'model' |
// 'service_tier'>). No registration -- recordAiUsage runs directly, matching the streaming
// tool loop's un-registered path (record-response-usage.mts:34-38).
function usageResponse(inputTokens: number, outputTokens: number) {
  return {
    usage: { input_tokens: inputTokens, output_tokens: outputTokens },
    model: 'gpt-6-luna',
    service_tier: 'flex' as const,
  }
}

// These tests cover the token-accumulator wiring and failure routing, not the spend cap
// (core.spend-cap.test.mts) -- disable it so they ignore ambient usage on the shared database.
function rateLimited() {
  return new RateLimitError(429, {}, 'rate limited', new Headers({ 'retry-after': '30' }))
}

describe('processAIAgentWorkerJob', () => {
  beforeEach(() => disableSpendCapForTest())

  it('reports the summed token count from every recordAgentResponseUsage call the job makes', async () => {
    const job = jobFor()
    const agentSlug = `token-accumulator-test-${randomUUID()}`

    const result = await processAIAgentWorkerJob(job, {
      processAIAgent: async () => {
        // Real recordAgentResponseUsage (the plan's single choke point), not a mock -- this is
        // what proves the wiring survives, not just a direct addAccumulatedTokens() call.
        await recordAgentResponseUsage({
          response: usageResponse(100, 20),
          agentSlug,
          transport: 'direct',
        })
        await recordAgentResponseUsage({
          response: usageResponse(50, 5),
          agentSlug,
          transport: 'direct',
        })
        return 'ok'
      },
    })

    expect(result).toBe('ok')
    expect(job.reportTokens).toHaveBeenCalledExactlyOnceWith(175)
    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })

  it('does not call reportTokens when the job consumes no tokens', async () => {
    const job = jobFor()

    await processAIAgentWorkerJob(job, { processAIAgent: async () => 'ok' })

    expect(job.reportTokens).not.toHaveBeenCalled()
  })

  it('still reports accumulated tokens when the job throws, then defers it on a provider rate limit', async () => {
    const job = jobFor()
    const agentSlug = `token-accumulator-test-${randomUUID()}`

    await expect(
      processAIAgentWorkerJob(job, {
        processAIAgent: async () => {
          await recordAgentResponseUsage({
            response: usageResponse(30, 10),
            agentSlug,
            transport: 'direct',
          })
          throw rateLimited()
        },
      }),
    ).rejects.toThrow(DelayedError)

    expect(job.reportTokens).toHaveBeenCalledExactlyOnceWith(40)
    expect(job.moveToDelayed).toHaveBeenCalledOnce()
  })

  it("defers on processAIAgent's original rate limit even when reportTokens rejects", async () => {
    const job = jobFor()
    const agentSlug = `token-accumulator-test-${randomUUID()}`
    job.reportTokens = vi
      .fn<(count: number) => Promise<void>>()
      .mockRejectedValue(new Error('reportTokens Valkey blip'))

    // Without the accumulator catching reportTokens' rejection, that rejection would replace
    // the rate limit, so the job would never be deferred on an actual 429.
    await expect(
      processAIAgentWorkerJob(job, {
        processAIAgent: async () => {
          await recordAgentResponseUsage({
            response: usageResponse(30, 10),
            agentSlug,
            transport: 'direct',
          })
          throw rateLimited()
        },
      }),
    ).rejects.toThrow(DelayedError)

    expect(job.moveToDelayed).toHaveBeenCalledOnce()
  })

  it('isolates concurrent jobs -- one job never sees another job in-flight on the same worker', async () => {
    const jobA = jobFor()
    const jobB = jobFor()
    const agentSlug = `token-accumulator-test-${randomUUID()}`
    const firstJobRecordedUsage = Promise.withResolvers<void>()
    const releaseFirstJob = Promise.withResolvers<void>()

    await Promise.all([
      processAIAgentWorkerJob(jobA, {
        processAIAgent: async () => {
          await recordAgentResponseUsage({
            response: usageResponse(1000, 1000),
            agentSlug,
            transport: 'direct',
          })
          firstJobRecordedUsage.resolve()
          await releaseFirstJob.promise
          await recordAgentResponseUsage({
            response: usageResponse(1, 1),
            agentSlug,
            transport: 'direct',
          })
          return 'a'
        },
      }),
      processAIAgentWorkerJob(jobB, {
        processAIAgent: async () => {
          await firstJobRecordedUsage.promise
          try {
            await recordAgentResponseUsage({
              response: usageResponse(7, 0),
              agentSlug,
              transport: 'direct',
            })
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

describe('processAIAgentWorkerJob model provider failures', () => {
  beforeEach(() => disableSpendCapForTest())

  it('routes a provider failure to the model provider handler, not the OpenAI rate limiter', async () => {
    const job = jobFor()
    const failure = new ModelProviderError('credit-balance-too-low', 'credit balance too low', {
      retryClass: 'permanent',
      status: 400,
    })

    await expect(
      processAIAgentWorkerJob(job, { processAIAgent: () => Promise.reject(failure) }),
    ).rejects.toBeInstanceOf(UnrecoverableError)

    expect(job.moveToDelayed).not.toHaveBeenCalled()
  })
})

describe('processAIAgentWorkerJob response recovery', () => {
  beforeEach(() => {
    disableSpendCapForTest()
    vi.stubEnv('OPENAI_API_KEY', 'recovery-rate-limit-fixture')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('defers a provider rate limit before replay and preserves the response id', async () => {
    const job = jobFor()
    job.data.backgroundResponses = [
      {
        responseId: `resp_${randomUUID()}`,
        agentSlug: 'story-post',
        communityId: null,
        postId: null,
        createdAt: new Date().toISOString(),
      },
    ]
    const rateLimit = APIError.generate(
      429,
      { error: { code: 'rate_limit_exceeded' } },
      '',
      new Headers(),
    )
    const retrieve = vi.spyOn(Responses.prototype, 'retrieve').mockRejectedValue(rateLimit)
    const processAIAgent = vi.fn<() => Promise<unknown>>()
    try {
      await expect(processAIAgentWorkerJob(job, { processAIAgent })).rejects.toThrow(DelayedError)
      expect(job.moveToDelayed).toHaveBeenCalledOnce()
      expect(processAIAgent).not.toHaveBeenCalled()
      expect(job.data.backgroundResponses).toHaveLength(1)
    } finally {
      retrieve.mockRestore()
    }
  })

  it('rethrows a non-rate-limit recovery error without dispatching the model', async () => {
    const job = jobFor()
    job.data.backgroundResponses = [
      {
        responseId: `resp_${randomUUID()}`,
        agentSlug: 'story-post',
        communityId: null,
        postId: null,
        createdAt: new Date().toISOString(),
      },
    ]
    const failure = new Error('provider unavailable')
    const retrieve = vi.spyOn(Responses.prototype, 'retrieve').mockRejectedValue(failure)
    const processAIAgent = vi.fn<() => Promise<unknown>>()
    try {
      await expect(processAIAgentWorkerJob(job, { processAIAgent })).rejects.toBe(failure)
      expect(job.moveToDelayed).not.toHaveBeenCalled()
      expect(processAIAgent).not.toHaveBeenCalled()
    } finally {
      retrieve.mockRestore()
    }
  })
})

function jobFor(): Job<AIAgentJobData> {
  return spendCapDelayableJob('report-judgement', {} as AIAgentJobData)
}
