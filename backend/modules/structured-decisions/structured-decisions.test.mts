import { describe, expect, it, vi } from 'vitest'
import { Response } from 'undici'
import {
  StructuredDecisionError,
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
} from './structured-decisions.mts'

const request: StructuredDecisionRequest = {
  state: 'A post about a local bakery.',
  questions: [
    { id: 'spam', type: 'noul', question: 'Is this spam?' },
    {
      id: 'topic',
      type: 'choice',
      question: 'Choose a topic.',
      criteria: ['food', 'sports'],
    },
    {
      id: 'quality',
      type: 'score',
      question: 'Score quality.',
      criteria: [
        { description: 'poor', value: 0 },
        { description: 'excellent', value: 1 },
      ],
    },
  ],
}

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function makeOpenRouterBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    id: 'decision-1',
    model: 'typesafe/jev-1.13-20260917',
    provider: 'TypeSafe',
    usage: { input_tokens: 12, output_tokens: 0 },
    answers: [
      {
        id: 'quality',
        type: 'score',
        score: 1,
        confidence: 0.9,
        legend: ['poor', 'excellent'],
        probabilities: { poor: 0.1, excellent: 0.9 },
      },
      { id: 'spam', type: 'noul', noul: 0.2 },
      {
        id: 'topic',
        type: 'choice',
        choice: 'food',
        confidence: 0.8,
        probabilities: { food: 0.8, sports: 0.2 },
      },
    ],
    ...overrides,
  }
}

describe('createStructuredDecisionClient', () => {
  it('normalizes OpenRouter native answers to request order and retains the raw body', async () => {
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(makeResponse(makeOpenRouterBody()))
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      sleep: async () => undefined,
    })

    const result = await client.decide(request)

    expect(result.answers).toEqual([
      { id: 'spam', type: 'noul', probability: 0.2 },
      {
        id: 'topic',
        type: 'choice',
        choice: 'food',
        confidence: 0.8,
        probabilities: { food: 0.8, sports: 0.2 },
      },
      {
        id: 'quality',
        type: 'score',
        score: 1,
        confidence: 0.9,
        legend: ['poor', 'excellent'],
        probabilities: { poor: 0.1, excellent: 0.9 },
      },
    ])
    expect(result.raw).toEqual(makeOpenRouterBody())
    expect(fetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['missing', { answers: [] }],
    [
      'duplicate',
      {
        answers: [
          { id: 'spam', type: 'noul', noul: 0.2 },
          { id: 'spam', type: 'noul', noul: 0.2 },
          {
            id: 'topic',
            type: 'choice',
            choice: 'food',
            confidence: 0.8,
            probabilities: { food: 0.8, sports: 0.2 },
          },
          {
            id: 'quality',
            type: 'score',
            score: 1,
            confidence: 0.9,
            legend: ['poor', 'excellent'],
            probabilities: { poor: 0.1, excellent: 0.9 },
          },
        ],
      },
    ],
    [
      'unknown',
      {
        answers: [
          { id: 'spam', type: 'noul', noul: 0.2 },
          {
            id: 'topic',
            type: 'choice',
            choice: 'food',
            confidence: 0.8,
            probabilities: { food: 0.8, sports: 0.2 },
          },
          {
            id: 'quality',
            type: 'score',
            score: 1,
            confidence: 0.9,
            legend: ['poor', 'excellent'],
            probabilities: { poor: 0.1, excellent: 0.9 },
          },
          { id: 'extra', type: 'noul', noul: 0.1 },
        ],
      },
    ],
  ])('fails closed for %s answer coverage', async (_name, overrides) => {
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch: vi
        .fn<StructuredDecisionFetch>()
        .mockResolvedValue(makeResponse(makeOpenRouterBody(overrides))),
      sleep: async () => undefined,
    })
    await expect(client.decide(request)).rejects.toMatchObject<Partial<StructuredDecisionError>>({
      code: 'invalid-response',
    })
  })

  it.each([
    [
      'choice outside criteria',
      {
        answers: [
          { id: 'spam', type: 'noul', noul: 0.2 },
          {
            id: 'topic',
            type: 'choice',
            choice: 'other',
            confidence: 0.8,
            probabilities: { food: 0.8, sports: 0.2 },
          },
          {
            id: 'quality',
            type: 'score',
            score: 1,
            confidence: 0.9,
            legend: ['poor', 'excellent'],
            probabilities: { poor: 0.1, excellent: 0.9 },
          },
        ],
      },
    ],
    [
      'invalid probability total',
      {
        answers: [
          { id: 'spam', type: 'noul', noul: 0.2 },
          {
            id: 'topic',
            type: 'choice',
            choice: 'food',
            confidence: 0.8,
            probabilities: { food: 0.7, sports: 0.2 },
          },
          {
            id: 'quality',
            type: 'score',
            score: 1,
            confidence: 0.9,
            legend: ['poor', 'excellent'],
            probabilities: { poor: 0.1, excellent: 0.9 },
          },
        ],
      },
    ],
  ])('fails closed for %s', async (_name, overrides) => {
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch: vi
        .fn<StructuredDecisionFetch>()
        .mockResolvedValue(makeResponse(makeOpenRouterBody(overrides))),
      sleep: async () => undefined,
    })
    await expect(client.decide(request)).rejects.toMatchObject<Partial<StructuredDecisionError>>({
      code: 'invalid-response',
    })
  })

  it('retries same transport on a retryable response without changing the request', async () => {
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValueOnce(makeResponse({ error: 'busy' }, 529))
      .mockResolvedValueOnce(makeResponse(makeOpenRouterBody()))
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      sleep: async () => undefined,
    })
    await client.decide(request)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]?.[0]).toBe('https://openrouter.ai/api/alpha/decisions')
    expect(fetch.mock.calls[1]?.[0]).toBe('https://openrouter.ai/api/alpha/decisions')
  })

  it('does not retry invalid successful responses or ordinary 4xx responses', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(makeResponse({ answers: [] }))
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      sleep: async () => undefined,
    })
    await expect(client.decide(request)).rejects.toMatchObject({ code: 'invalid-response' })
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('rejects invalid outgoing question definitions before dispatch', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>()
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      sleep: async () => undefined,
    })
    await expect(client.decide({ state: '', questions: [] })).rejects.toMatchObject({
      code: 'invalid-request',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
