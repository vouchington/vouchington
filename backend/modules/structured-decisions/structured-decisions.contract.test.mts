import { Response } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
} from './structured-decisions.mts'

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
  it('preserves each validated direct-TypeSafe answer fragment without synthesizing an ID', async () => {
    const body = openRouterBody()
    delete body.provider
    const result = await createStructuredDecisionClient({
      transport: 'typesafe',
      apiKey: 'test-key',
      fetch: vi.fn<StructuredDecisionFetch>().mockResolvedValue(response(body)),
      sleep: async () => undefined,
    }).decide(request)

    expect(result.answers).toMatchObject([
      { id: 'spam', raw: { type: 'noul', noul: 0.2 } },
      {
        id: 'topic',
        raw: {
          type: 'choice',
          choice: 'food',
          confidence: 0.8,
          probabilities: { food: 0.8, sports: 0.2 },
        },
      },
    ])
    expect(result.answers[0]?.raw).not.toHaveProperty('id')
  })

  it('serializes direct TypeSafe questions as an ID-keyed native record and accepts its provider-less response', async () => {
    const body = openRouterBody()
    delete body.provider
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response(body))
    const result = await createStructuredDecisionClient({
      transport: 'typesafe',
      apiKey: 'test-key',
      fetch,
      sleep: async () => undefined,
    }).decide(request)

    expect(result.provider).toBe('TypeSafe')
    expect(fetch.mock.calls[0]?.[0]).toBe('https://api.typesafe.ai/v1/systemone')
    const dispatched = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
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
      sleep: async () => undefined,
    }).decide(request)
    expect(JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)).provider).toEqual({
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

  it('accepts a three-level score above one and rejects a score beyond its last criterion', async () => {
    const scoreRequest: StructuredDecisionRequest = {
      state: 'state',
      questions: [
        {
          id: 'score',
          type: 'score',
          question: 'score',
          criteria: [
            { value: 0, description: 'low' },
            { value: 1, description: 'medium' },
            { value: 2, description: 'high' },
          ],
        },
      ],
    }
    const score = {
      type: 'score',
      score: 1.5,
      confidence: 0.8,
      legend: { 0: 'low', 1: 'medium', 2: 'high' },
      probabilities: { 0: 0.2, 1: 0.3, 2: 0.5 },
    }
    const success = { model: 'typesafe/jev-1.13', provider: 'TypeSafe', answers: { score } }
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response(success))
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      sleep: async () => undefined,
    })
    await expect(client.decide(scoreRequest)).resolves.toMatchObject({ answers: [{ score: 1.5 }] })
    fetch.mockResolvedValue(response({ ...success, answers: { score: { ...score, score: 2.1 } } }))
    await expect(client.decide(scoreRequest)).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it('rejects extra Score legend keys', async () => {
    const scoreRequest: StructuredDecisionRequest = {
      state: 'state',
      questions: [
        {
          id: 'score',
          type: 'score',
          question: 'score',
          criteria: [
            { value: 0, description: 'low' },
            { value: 1, description: 'high' },
          ],
        },
      ],
    }
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(
      response({
        model: 'typesafe/jev-1.13',
        provider: 'TypeSafe',
        answers: {
          score: {
            type: 'score',
            score: 1,
            confidence: 0.8,
            legend: { 0: 'low', 1: 'high', 2: 'extra' },
            probabilities: { 0: 0.2, 1: 0.8 },
          },
        },
      }),
    )
    await expect(
      createStructuredDecisionClient({
        transport: 'openrouter',
        apiKey: 'test-key',
        fetch,
      }).decide(scoreRequest),
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })
})
