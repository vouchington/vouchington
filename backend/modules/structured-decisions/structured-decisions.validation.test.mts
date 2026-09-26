import { Response } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
} from './structured-decisions.mts'

const request: StructuredDecisionRequest = {
  state: 'state',
  questions: [
    { id: 'spam', type: 'noul', question: 'spam?' },
    { id: 'topic', type: 'choice', question: 'topic?', criteria: ['food', 'sports'] },
    {
      id: 'quality',
      type: 'score',
      question: 'quality?',
      criteria: [
        { value: 0, description: 'poor' },
        { value: 1, description: 'excellent' },
      ],
    },
  ],
}

function body(): { model: string; provider: string; answers: Record<string, unknown>[] } {
  return {
    model: 'typesafe/jev-1.13-test',
    provider: 'TypeSafe',
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
    ],
  }
}

describe('structured-decision response validation edges', () => {
  it.each([
    ['answer array entry without ID', { answers: [{ type: 'noul', noul: 0.2 }] }],
    ['invalid answers container', { answers: null }],
    [
      'answer primitive mismatch',
      {
        answers: body().answers.map(answer =>
          answer.id === 'spam' ? { ...answer, type: 'choice' } : answer,
        ),
      },
    ],
    [
      'score legend value mismatch',
      {
        answers: body().answers.map(answer =>
          answer.id === 'quality' ? { ...answer, legend: ['poor', 'wrong'] } : answer,
        ),
      },
    ],
    [
      'score probability keys mismatch',
      {
        answers: body().answers.map(answer =>
          answer.id === 'quality' ? { ...answer, probabilities: { poor: 1 } } : answer,
        ),
      },
    ],
  ])('rejects %s', async (_name, overrides) => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(
      new Response(JSON.stringify({ ...body(), ...overrides }), {
        headers: { 'content-type': 'application/json' },
      }),
    )
    await expect(
      createStructuredDecisionClient({
        transport: 'openrouter',
        apiKey: 'test-key',
        fetch,
      }).decide(request),
    ).rejects.toMatchObject({ code: 'invalid-response' })
  })
})
