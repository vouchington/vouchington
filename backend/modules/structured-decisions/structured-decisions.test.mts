import { describe, expect, it, vi } from 'vitest'
import {
  bakeryStructuredDecisionRequest as request,
  makeOpenRouterStructuredDecisionBody as makeOpenRouterBody,
  makeStructuredDecisionResponse as makeResponse,
} from './structured-decisions-fixtures.mts'
import {
  StructuredDecisionError,
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
} from './structured-decisions.mts'

describe('createStructuredDecisionClient', () => {
  it('requires a non-empty API key', () => {
    expect(() =>
      createStructuredDecisionClient({ transport: 'openrouter', apiKey: '   ' }),
    ).toThrow('API key')
  })

  it('normalizes OpenRouter native answers to request order and retains the raw body', async () => {
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(makeResponse(makeOpenRouterBody()))
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
    })

    const result = await client.decide(request)

    expect(result.answers).toEqual([
      { id: 'spam', type: 'noul', probability: 0.2, raw: { id: 'spam', type: 'noul', noul: 0.2 } },
      {
        id: 'topic',
        type: 'choice',
        choice: 'food',
        confidence: 0.8,
        probabilities: { food: 0.8, sports: 0.2 },
        raw: {
          id: 'topic',
          type: 'choice',
          choice: 'food',
          confidence: 0.8,
          probabilities: { food: 0.8, sports: 0.2 },
        },
      },
      {
        id: 'quality',
        type: 'score',
        score: 1,
        confidence: 0.9,
        legend: ['poor', 'excellent'],
        probabilities: { poor: 0.1, excellent: 0.9 },
        raw: {
          id: 'quality',
          type: 'score',
          score: 1,
          confidence: 0.9,
          legend: ['poor', 'excellent'],
          probabilities: { poor: 0.1, excellent: 0.9 },
        },
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
    })
    await expect(client.decide(request)).rejects.toMatchObject<Partial<StructuredDecisionError>>({
      code: 'invalid-response',
    })
  })

  it('makes exactly one attempt for invalid successful responses and ordinary 4xx responses', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(makeResponse({ answers: [] }))
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
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
    })
    await expect(client.decide({ state: '', questions: [] })).rejects.toMatchObject({
      code: 'invalid-request',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})
