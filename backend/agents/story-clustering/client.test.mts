import { randomUUID } from 'node:crypto'
import { Response } from 'undici'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StructuredDecisionFetch } from '@modules/structured-decisions'
import { spendCapConfig } from '@services/ai-usage'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { createStoryClusteringClient } from './client.mts'

const CRITERIA = ['story:a', 'rss_feed_item:b', 'none'] as const

const request = {
  state: 'an article and its candidates',
  questions: [
    { id: 'story-clustering', type: 'choice', question: 'Which one?', criteria: CRITERIA },
  ],
} as const

/** A provider that picks `none` for every question, and records its calls in order. */
function provider(calls: string[]) {
  return vi.fn<StructuredDecisionFetch>(async (_url, init) => {
    calls.push('fetch')
    const body = JSON.parse(stringFromUnknown(init?.body)) as { questions: Record<string, unknown> }
    return Response.json({
      id: `decision-${randomUUID()}`,
      model: 'typesafe/jev-1.13',
      provider: 'TypeSafe',
      usage: { input_tokens: 5, output_tokens: 1, cost: 0 },
      answers: Object.keys(body.questions).map(id => ({
        id,
        type: 'choice',
        choice: 'none',
        confidence: 0.8,
        probabilities: { 'story:a': 0.1, 'rss_feed_item:b': 0.1, none: 0.8 },
      })),
    })
  })
}

describe('createStoryClusteringClient', () => {
  let restoreSpendCap: (() => void) | undefined
  let classifierRunId: string
  beforeAll(async () => {
    classifierRunId = await reserveSyntheticRunId()
    await spendCapConfig.waitForInitialization()
    restoreSpendCap = overrideDynamicConfigFieldsForTest(spendCapConfig, { enabled: false })
  })
  afterAll(() => restoreSpendCap?.())

  it('reserves the provider attempt once, before the single physical request', async () => {
    const calls: string[] = []
    const fetch = provider(calls)
    const beforeAttempt = vi.fn<() => Promise<void>>(async () => void calls.push('reserve'))
    const client = createStoryClusteringClient(
      { classifierRunId, modelProvider: 'openrouter', beforeAttempt },
      { fetch, apiKey: 'test-provider-key' },
    )

    const result = await client.decide(request)

    expect(calls).toEqual(['reserve', 'fetch'])
    expect(beforeAttempt).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(result.answers).toMatchObject([{ type: 'choice', choice: 'none' }])
  })

  it('sends nothing when the durable reservation refuses the attempt', async () => {
    const fetch = provider([])
    const beforeAttempt = vi.fn<() => Promise<void>>(async () => {
      throw new Error('attempt cap reached')
    })
    const client = createStoryClusteringClient(
      { classifierRunId, modelProvider: 'openrouter', beforeAttempt },
      { fetch, apiKey: 'test-provider-key' },
    )

    await expect(client.decide(request)).rejects.toThrow('attempt cap reached')

    expect(fetch).not.toHaveBeenCalled()
  })

  it('rejects a choice outside the criteria it asked about, so a bad answer never persists', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>(async (_url, init) => {
      const body = JSON.parse(stringFromUnknown(init?.body)) as {
        questions: Record<string, unknown>
      }
      return Response.json({
        id: `decision-${randomUUID()}`,
        model: 'typesafe/jev-1.13',
        provider: 'TypeSafe',
        usage: { input_tokens: 5, output_tokens: 1, cost: 0 },
        answers: Object.keys(body.questions).map(id => ({
          id,
          type: 'choice',
          choice: 'story:somewhere-else',
          confidence: 0.9,
          probabilities: { 'story:a': 0.05, 'rss_feed_item:b': 0.05, none: 0.9 },
        })),
      })
    })
    const client = createStoryClusteringClient(
      { classifierRunId, modelProvider: 'openrouter', beforeAttempt: async () => {} },
      { fetch, apiKey: 'test-provider-key' },
    )

    await expect(client.decide(request)).rejects.toThrow('not one of the requested criteria')
  })

  it('cannot be built for a provider it has no key source for', () => {
    expect(() =>
      createStoryClusteringClient(
        { classifierRunId, modelProvider: 'typesafe', beforeAttempt: async () => {} },
        { apiKey: 'test-provider-key' },
      ),
    ).toThrow("no API key source for provider 'typesafe'")
  })

  it('cannot be built without an API key', () => {
    vi.stubEnv('OPENROUTER_API_KEY', '')

    expect(() =>
      createStoryClusteringClient({
        classifierRunId,
        modelProvider: 'openrouter',
        beforeAttempt: async () => {},
      }),
    ).toThrow('API key is required')

    vi.unstubAllEnvs()
  })
})
