import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import { openAiSpendCapConfig, OpenAiSpendCapBreachError } from '@services/ai-usage'
import { findAiUsageRecordForPost, pollUntilNotNull } from '@voucha/test-helpers'
import { createAutotaggerPostFixture } from '@voucha/test-helpers/data-stores/psql/classifier-runs/autotagger-fixture'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { createAutotaggerAgentClient, createAutotaggerClient } from './classifier-run-client.mts'

const request = {
  state: 'a post',
  questions: [{ id: randomUUID(), type: 'noul', question: 'Is this about cats?' }],
} as const

/** A provider that answers every question, and records the order of its calls against the hook. */
function provider(calls: string[]) {
  return vi.fn<StructuredDecisionFetch>(async (_url, init) => {
    calls.push('fetch')
    const body = JSON.parse(stringFromUnknown(init?.body)) as { questions: Record<string, unknown> }
    return Response.json({
      id: `decision-${randomUUID()}`,
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      usage: { input_tokens: 5, output_tokens: 0, cost: 0 },
      answers: Object.keys(body.questions).map(id => ({ id, type: 'noul', noul: 0.9 })),
    })
  })
}

describe('createAutotaggerClient', () => {
  let restoreSpendCap: (() => void) | undefined
  let classifierRunId: string
  beforeAll(async () => {
    classifierRunId = await reserveSyntheticRunId()
    await openAiSpendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(openAiSpendCapConfig, { enabled: false })
  })
  afterAll(() => restoreSpendCap?.())

  it('reserves the provider attempt once, before the single physical request', async () => {
    const calls: string[] = []
    const fetch = provider(calls)
    const beforeAttempt = vi.fn<() => Promise<void>>(async () => void calls.push('reserve'))
    const client = createAutotaggerClient(
      { classifierRunId, postId: null, modelProvider: 'openrouter', beforeAttempt },
      { fetch, apiKey: 'test-provider-key' },
    )

    await client.decide(request)

    expect(calls).toEqual(['reserve', 'fetch'])
    expect(beforeAttempt).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('records the reasoning pass under its own workload, never the first stage’s', async () => {
    const { post } = await createAutotaggerPostFixture({ topicCount: 0 })
    const client = createAutotaggerAgentClient(
      {
        classifierRunId,
        postId: post.id,
        modelProvider: 'openrouter',
        beforeAttempt: async () => {},
      },
      { fetch: provider([]), apiKey: 'test-provider-key' },
    )

    await client.decide(request)

    await expect(
      pollUntilNotNull(() => findAiUsageRecordForPost(post.id, 'autotagger-agent')),
    ).resolves.toMatchObject({ input_tokens: 5 })
    expect(await findAiUsageRecordForPost(post.id, 'autotagger')).toBeNull()
  })

  it('reserves the reasoning pass’s attempt once, before its single physical request', async () => {
    const calls: string[] = []
    const fetch = provider(calls)
    const beforeAttempt = vi.fn<() => Promise<void>>(async () => void calls.push('reserve'))
    const client = createAutotaggerAgentClient(
      { classifierRunId, postId: null, modelProvider: 'openrouter', beforeAttempt },
      { fetch, apiKey: 'test-provider-key' },
    )

    await client.decide(request)

    expect(calls).toEqual(['reserve', 'fetch'])
  })

  it('sends nothing and reserves no attempt once the daily spend cap is reached', async () => {
    await withReservedAiUsageDay(0, async () => {
      const fetch = provider([])
      const beforeAttempt = vi.fn<() => Promise<void>>(async () => {})
      const client = createAutotaggerAgentClient(
        { classifierRunId, postId: null, modelProvider: 'openrouter', beforeAttempt },
        { fetch, apiKey: 'test-provider-key' },
      )

      await expect(client.decide(request)).rejects.toBeInstanceOf(OpenAiSpendCapBreachError)

      expect(fetch).not.toHaveBeenCalled()
      expect(beforeAttempt).not.toHaveBeenCalled()
    })
  })

  it('sends nothing when the durable reservation refuses the attempt', async () => {
    const fetch = provider([])
    const beforeAttempt = vi.fn<() => Promise<void>>(async () => {
      throw new Error('attempt cap reached')
    })
    const client = createAutotaggerClient(
      { classifierRunId, postId: null, modelProvider: 'openrouter', beforeAttempt },
      { fetch, apiKey: 'test-provider-key' },
    )

    await expect(client.decide(request)).rejects.toThrow('attempt cap reached')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('cannot be built for a provider it has no key source for', () => {
    expect(() =>
      createAutotaggerClient(
        { classifierRunId, postId: null, modelProvider: 'typesafe', beforeAttempt: async () => {} },
        { apiKey: 'test-provider-key' },
      ),
    ).toThrow("no API key source for provider 'typesafe'")
  })

  it('cannot be built without an API key', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')

    expect(() =>
      createAutotaggerClient({
        classifierRunId,
        postId: null,
        modelProvider: 'openrouter',
        beforeAttempt: async () => {},
      }),
    ).toThrow('API key is required')

    vi.unstubAllEnvs()
  })
})
