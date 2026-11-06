import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { RateLimitError } from 'openai'
import { describe, expect, it, vi } from 'vitest'
import { ModelProviderError } from '@vouchington/ai/providers'
import { disableSpendCapForTest } from '@voucha/test-helpers/ai-agents-spend-cap'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import {
  createAIAgentReportFixture,
  installAIAgentProviderFixtures,
} from '@voucha/test-helpers/ai-agent-worker-fixtures'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

describe('registered ai_agents native provider rate limits', () => {
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
  ] as const)(
    'parks only the job that hit %s and still processes provider-free work',
    async (_name, createFailure, waitMs) => {
      await disableSpendCapForTest()
      const provider = installAIAgentProviderFixtures()
      const fixture = await createAIAgentReportFixture()
      provider.json.set(fixture.author.id, [createFailure()])
      const runtime = await startAIAgentWorkerForTest()
      vi.useFakeTimers({ toFake: ['Date'] })
      try {
        const outcome = await runtime.run('report-judgement', fixture.data, {
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
        })
        expect(outcome.kind).toBe('delayed')
        const [timestamp] = outcome.moveToDelayed.mock.calls[0] ?? []
        expect(timestamp! - Date.now()).toBeGreaterThan(waitMs - 1_000)
        expect(timestamp! - Date.now()).toBeLessThanOrEqual(waitMs)
        expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + waitMs)
        const stored = await runtime.queue.getJob(outcome.job.id)
        expect(await stored?.getState()).toBe('delayed')
        expect(stored?.attemptsMade).toBe(0)
        const free = await runtime.run('story-post', { post_id: fixture.postId })
        expect(free.kind).toBe('completed')
        await runtime.close()
      } finally {
        vi.useRealTimers()
      }
    },
  )
})
