import '@voucha/test-helpers/vitest.setup.sentry-mock'
import { APIError } from 'openai'
import { Responses } from 'openai/resources/responses/responses'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelProviderError } from '@vouchington/ai/providers'
import { UnrecoverableError } from '@vouchington/queue-errors'
import { disableSpendCapForTest } from '@voucha/test-helpers/ai-agents-spend-cap'
import { startAIAgentWorkerForTest } from '@voucha/test-helpers/ai-agent-worker-lifecycle'
import {
  createAIAgentReportFixture,
  createAIAgentToolLoopFixture,
  installAIAgentProviderFixtures,
  rejectOwnedAIAgentTokenReport,
} from '@voucha/test-helpers/ai-agent-worker-fixtures'
import {
  makeDirectOpenAIResult,
  makeToolTurnResult,
} from '@voucha/test-helpers/agents/model-call-result'

vi.hoisted(() => {
  const url = new URL(process.env.VALKEY_URL || 'redis://localhost:6379')
  url.pathname = String(crypto.getRandomValues(new Uint32Array(1))[0] || 1)
  vi.stubEnv('VALKEY_WORKER_QUEUE_URL', url.toString())
})

const usage = (inputTokens: number, outputTokens: number) => ({
  inputTokens,
  outputTokens,
  cacheReadTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  reasoningOutputTokens: 0,
})

function billedRateLimit() {
  return new ModelProviderError('rate-limited', 'rate limited', {
    retryClass: 'transient',
    retryAfterMs: 30_000,
    status: 429,
    billedResponse: makeDirectOpenAIResult(`resp_${crypto.randomUUID()}`, {
      input_tokens: 30,
      output_tokens: 10,
    }),
  })
}

describe('AI agent worker token accounting and provider failure routing', () => {
  beforeEach(disableSpendCapForTest)

  it('reports the summed token count of two real billed tool turns', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentToolLoopFixture()
    provider.turns.set(fixture.providerFixtureKey, [
      makeToolTurnResult(
        [{ name: 'lookup_candidate_topics', input: { query: fixture.topics[0]!.name } }],
        { usage: usage(100, 20) },
      ),
      makeToolTurnResult([{ name: 'submit_topics', input: { topic_ids: [] } }], {
        usage: usage(50, 5),
      }),
    ])
    const runtime = await startAIAgentWorkerForTest()
    const outcome = await runtime.run('classifier-run', fixture.data)
    expect(outcome.kind).toBe('completed')
    expect(outcome.reportTokens).toHaveBeenCalledExactlyOnceWith(175)
    expect(outcome.moveToDelayed).not.toHaveBeenCalled()
  })

  it('does not report tokens for a real provider-free job', async () => {
    installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    const runtime = await startAIAgentWorkerForTest()
    const outcome = await runtime.run('story-post', { post_id: fixture.postId })
    expect(outcome.kind).toBe('completed')
    expect(outcome.reportTokens).not.toHaveBeenCalled()
  })

  it('reports billed tokens before parking a provider rate limit', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    provider.json.set(fixture.author.id, [billedRateLimit()])
    const runtime = await startAIAgentWorkerForTest()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const outcome = await runtime.run('report-judgement', fixture.data)
      expect(outcome.kind).toBe('delayed')
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 30_000)
      expect(outcome.reportTokens).toHaveBeenCalledExactlyOnceWith(40)
    } finally {
      vi.useRealTimers()
    }
  })

  it('preserves the original provider delay when the owned token-report command fails', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    provider.json.set(fixture.author.id, [billedRateLimit()])
    const runtime = await startAIAgentWorkerForTest()
    runtime.worker.on('active', job => {
      rejectOwnedAIAgentTokenReport(job.id, new Error('reportTokens Valkey blip'))
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const outcome = await runtime.run('report-judgement', fixture.data)
      expect(outcome.kind).toBe('delayed')
      expect(outcome.reportTokens).toHaveBeenCalledExactlyOnceWith(40)
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 30_000)
    } finally {
      vi.useRealTimers()
    }
  })

  it('isolates two concurrent real tool-loop jobs', async () => {
    const provider = installAIAgentProviderFixtures()
    const [first, second] = await Promise.all([
      createAIAgentToolLoopFixture(),
      createAIAgentToolLoopFixture(),
    ])
    const firstAtSecondTurn = Promise.withResolvers<void>()
    const interleaving: string[] = []
    const releaseFirst = Promise.withResolvers<void>()
    provider.turns.set(first.providerFixtureKey, [
      async () => {
        return makeToolTurnResult(
          [{ name: 'lookup_candidate_topics', input: { query: first.topics[0]!.name } }],
          { usage: usage(1000, 1000) },
        )
      },
      async () => {
        interleaving.push('first-awaiting-second-turn')
        firstAtSecondTurn.resolve()
        await releaseFirst.promise
        interleaving.push('first-finishes')
        return makeToolTurnResult([{ name: 'submit_topics', input: { topic_ids: [] } }], {
          usage: usage(1, 1),
        })
      },
    ])
    provider.turns.set(second.providerFixtureKey, [
      async () => {
        await firstAtSecondTurn.promise
        interleaving.push('second-turn')
        releaseFirst.resolve()
        return makeToolTurnResult([{ name: 'submit_topics', input: { topic_ids: [] } }], {
          usage: usage(7, 0),
        })
      },
    ])
    const runtime = await startAIAgentWorkerForTest()
    try {
      const [a, b] = await Promise.all([
        runtime.run('classifier-run', first.data),
        runtime.run('classifier-run', second.data),
      ])
      expect(a.kind).toBe('completed')
      expect(b.kind).toBe('completed')
      expect(a.reportTokens).toHaveBeenCalledExactlyOnceWith(2002)
      expect(b.reportTokens).toHaveBeenCalledExactlyOnceWith(7)
      expect(interleaving).toEqual(['first-awaiting-second-turn', 'second-turn', 'first-finishes'])
    } finally {
      firstAtSecondTurn.resolve()
      releaseFirst.resolve()
    }
  })

  it('routes a permanent provider failure without parking at the OpenAI rate-limit boundary', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    provider.json.set(fixture.author.id, [
      new ModelProviderError('credit-balance-too-low', 'credit balance too low', {
        retryClass: 'permanent',
        status: 400,
      }),
    ])
    const runtime = await startAIAgentWorkerForTest()
    const outcome = await runtime.run('report-judgement', fixture.data)
    expect(outcome.kind).toBe('failed')
    expect(outcome.error).toBeInstanceOf(UnrecoverableError)
    expect(outcome.moveToDelayed).not.toHaveBeenCalled()
  })

  it('parks a recovery rate limit before replay and preserves the response id', async () => {
    installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    const responseId = `resp_${crypto.randomUUID()}`
    const backgroundResponses = [
      {
        responseId,
        agentSlug: 'story-post',
        communityId: null,
        postId: null,
        createdAt: new Date().toISOString(),
      },
    ]
    const retrieve = vi
      .spyOn(Responses.prototype, 'retrieve')
      .mockRejectedValue(
        APIError.generate(429, { error: { code: 'rate_limit_exceeded' } }, '', new Headers()),
      )
    const priorKey = process.env.OPENAI_API_KEY
    vi.stubEnv('OPENAI_API_KEY', 'recovery-rate-limit-fixture')
    const runtime = await startAIAgentWorkerForTest()
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const outcome = await runtime.run('report-judgement', {
        ...fixture.data,
        backgroundResponses,
      })
      expect(outcome.kind).toBe('delayed')
      expect(outcome.moveToDelayed).toHaveBeenCalledExactlyOnceWith(Date.now() + 60_000)
      expect(outcome.job.data.backgroundResponses).toHaveLength(1)
      expect(outcome.job.data.backgroundResponses?.[0]?.responseId).toBe(responseId)
    } finally {
      retrieve.mockRestore()
      vi.stubEnv('OPENAI_API_KEY', priorKey)
      vi.useRealTimers()
    }
  })

  it('preserves a non-rate-limit recovery error without model dispatch', async () => {
    const provider = installAIAgentProviderFixtures()
    const fixture = await createAIAgentReportFixture()
    const backgroundResponses = [
      {
        responseId: `resp_${crypto.randomUUID()}`,
        agentSlug: 'story-post',
        communityId: null,
        postId: null,
        createdAt: new Date().toISOString(),
      },
    ]
    const failure = new Error('provider unavailable')
    const retrieve = vi.spyOn(Responses.prototype, 'retrieve').mockRejectedValue(failure)
    const priorKey = process.env.OPENAI_API_KEY
    vi.stubEnv('OPENAI_API_KEY', 'recovery-rate-limit-fixture')
    try {
      const runtime = await startAIAgentWorkerForTest()
      const outcome = await runtime.run('report-judgement', {
        ...fixture.data,
        backgroundResponses,
      })
      expect(outcome.kind).toBe('failed')
      expect(outcome.error).toBe(failure)
      expect(outcome.moveToDelayed).not.toHaveBeenCalled()
      expect(provider.generateJson).not.toHaveBeenCalled()
    } finally {
      retrieve.mockRestore()
      vi.stubEnv('OPENAI_API_KEY', priorKey)
    }
  })
})
