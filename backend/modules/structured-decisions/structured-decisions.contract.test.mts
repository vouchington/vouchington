import { Response } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
} from './structured-decisions.mts'
import type { StructuredDecisionRequest } from '@vouchington/ai/structured-decisions'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const request: StructuredDecisionRequest = {
  state: 'A post about a local bakery.',
  questions: [
    { id: 'spam', type: 'noul', question: 'Is this spam?' },
    { id: 'topic', type: 'choice', question: 'Choose a topic.', criteria: ['food', 'sports'] },
  ],
}

function response(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

function openRouterBody(): Record<string, unknown> {
  return {
    model: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    answers: {
      spam: { type: 'noul', noul: 0.2 },
      topic: {
        type: 'choice',
        choice: 'food',
        confidence: 0.8,
        probabilities: { food: 0.8, sports: 0.2 },
      },
    },
  }
}

describe('structured-decision transport contracts', () => {
  it('serializes direct TypeSafe questions as an ID-keyed native record and accepts its provider-less response', async () => {
    const body = openRouterBody()
    delete body.provider
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response(body))
    const result = await createStructuredDecisionClient({
      transport: 'typesafe',
      apiKey: 'test-key',
      fetch,
    }).decide(request)

    expect(result.provider).toBe('TypeSafe')
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.typesafe.ai/v1/systemone')
    const dispatched = JSON.parse(stringFromUnknown(fetch.mock.calls[0]?.[1]?.body))
    expect(dispatched).toMatchObject({
      model: 'jev-latest',
      questions: {
        spam: { instructions: 'Is this spam?', criteria: { false: 'No', true: 'Yes' } },
        topic: { criteria: { food: 'food', sports: 'sports' } },
      },
    })
    expect(dispatched).not.toHaveProperty('provider')
  })

  it('pins OpenRouter to TypeSafe without fallback', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response(openRouterBody()))
    await createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
    }).decide(request)
    expect(JSON.parse(stringFromUnknown(fetch.mock.calls[0]?.[1]?.body)).provider).toEqual({
      only: ['TypeSafe'],
      allow_fallbacks: false,
    })
  })

  it('rejects a direct TypeSafe model look-alike', async () => {
    const body = openRouterBody()
    delete body.provider
    body.model = 'jev-latestevil'
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response(body))
    await expect(
      createStructuredDecisionClient({
        transport: 'typesafe',
        apiKey: 'test-key',
        fetch,
      }).decide(request),
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })
})
