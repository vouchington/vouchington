import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RateLimitError } from 'openai'
import { StructuredDecisionError } from '@vouchington/ai/structured-decisions'
import * as glideMq from '@data-stores/valkey-glide-mq'
import { AI_AGENTS_QUEUE_NAME, CLASSIFIER_RUN_BACKOFF } from '@queues/ai-agents/config'
import { disableSpendCapForTest } from '@voucha/test-helpers/ai-agents-spend-cap'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import {
  createAIAgentReportFixture,
  installAIAgentProviderFixtures,
} from '@voucha/test-helpers/ai-agent-worker-fixtures'
import { classifierRunBackoffMs } from './processors/classifier-run-backoff.mts'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('registered AI agent worker factory and provider failures', () => {
  beforeEach(disableSpendCapForTest)

  it('constructs the actual worker with the dedicated client and exact runtime options', async () => {
    installAIAgentProviderFixtures()
    const prior = {
      rpm: process.env.OPENAI_RPM,
      tpm: process.env.OPENAI_TPM,
      concurrency: process.env.WORKER_CONCURRENCY_AI_AGENTS,
    }
    vi.stubEnv('OPENAI_RPM', '42')
    vi.stubEnv('OPENAI_TPM', '1234')
    vi.stubEnv('WORKER_CONCURRENCY_AI_AGENTS', '7')
    const createWorker = vi.spyOn(glideMq, 'createWorker')
    try {
      const runtime = await startAIAgentWorkerForTest()
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
      expect(createWorker.mock.results[0]?.value).toBe(runtime.worker)
      await runtime.close()
    } finally {
      createWorker.mockRestore()
      vi.stubEnv('OPENAI_RPM', prior.rpm)
      vi.stubEnv('OPENAI_TPM', prior.tpm)
      vi.stubEnv('WORKER_CONCURRENCY_AI_AGENTS', prior.concurrency)
    }
  })

  it('parks an original OpenAI SDK 429 at its thirty-second deadline', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    const rateLimit = new RateLimitError(
      429,
      {},
      'rate limited',
      new Headers({ 'retry-after': '30' }),
    )
    provider.json.set(fixture.author.id, [rateLimit])
    const runtime = await startAIAgentWorkerForTest()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const outcome = await runtime.run('report-judgement', fixture.data)
      expect(outcome.kind).toBe('delayed')
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 30_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves the original provider outage identity and five-minute backoff', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    const outage = new StructuredDecisionError('provider-error', 'HTTP 429', 429, {
      failure: { retryClass: 'transient', retryAfterMs: 5 * 60_000 },
    })
    provider.json.set(fixture.author.id, [outage])
    const runtime = await startAIAgentWorkerForTest()
    const outcome = await runtime.run('report-judgement', fixture.data)
    expect(outcome.kind).toBe('failed')
    expect(outcome.error).toBe(outage)
    expect(classifierRunBackoffMs(1, outcome.error!, () => 0)).toBe(300_000)
  })
})
