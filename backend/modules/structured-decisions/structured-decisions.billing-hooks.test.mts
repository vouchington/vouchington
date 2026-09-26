import { describe, expect, it, vi } from 'vitest'
import { Response } from 'undici'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
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
    usage: { input_tokens: 12, output_tokens: 0, cost: 0.0002 },
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

describe('billing hooks', () => {
  function onBilledResponseMock() {
    return vi.fn<NonNullable<StructuredDecisionAttemptHooks['onBilledResponse']>>()
  }

  it('fires onBilledResponse with the raw id, model, and usage for a successful decision', async () => {
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(makeResponse(makeOpenRouterBody()))
    const onBilledResponse = onBilledResponseMock().mockResolvedValue(undefined)
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      hooks: { onBilledResponse },
    })

    await client.decide(request)

    expect(onBilledResponse).toHaveBeenCalledOnce()
    expect(onBilledResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'decision-1',
        model: 'typesafe/jev-1.13-20260917',
        usage: { input_tokens: 12, output_tokens: 0, cost: 0.0002 },
      }),
    )
  })

  it('fires onBilledResponse before a decode failure, so a 2xx that fails strict decoding still reports its usage', async () => {
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(makeResponse(makeOpenRouterBody({ answers: [] })))
    const onBilledResponse = onBilledResponseMock().mockResolvedValue(undefined)
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      hooks: { onBilledResponse },
    })

    await expect(client.decide(request)).rejects.toMatchObject({ code: 'invalid-response' })

    expect(onBilledResponse).toHaveBeenCalledOnce()
    expect(onBilledResponse).toHaveBeenCalledWith(
      expect.objectContaining({ usage: { input_tokens: 12, output_tokens: 0, cost: 0.0002 } }),
    )
  })
})
