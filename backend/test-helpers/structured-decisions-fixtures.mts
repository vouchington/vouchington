import { Response } from 'undici'
import type { StructuredDecisionRequest } from '@vouchington/ai/structured-decisions'

export const bakeryStructuredDecisionRequest: StructuredDecisionRequest = {
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

export function makeStructuredDecisionResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function makeOpenRouterStructuredDecisionBody(
  overrides: Record<string, unknown> = {},
): unknown {
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

/** An OpenAI `/v1/decisions` body answering `bakeryStructuredDecisionRequest`, in question order. */
export function makeOpenAIStructuredDecisionBody(overrides: Record<string, unknown> = {}): unknown {
  return {
    model: 'gpt-6-luna',
    usage: {
      input_tokens: 40,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 3,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 43,
    },
    answers: [
      { name: 'spam', type: 'predicate', probability: 0.2 },
      {
        name: 'topic',
        type: 'choice',
        choice: 'food',
        confidence: 0.8,
        probabilities: [
          { value: 'food', probability: 0.8 },
          { value: 'sports', probability: 0.2 },
        ],
      },
      {
        name: 'quality',
        type: 'score',
        score: 1,
        confidence: 0.9,
        probabilities: [
          { value: 0, label: 'poor', probability: 0.1 },
          { value: 1, label: 'excellent', probability: 0.9 },
        ],
      },
    ],
    ...overrides,
  }
}
