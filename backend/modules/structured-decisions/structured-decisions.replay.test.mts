import { Response as UndiciResponse } from 'undici'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createProviderReplay, loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
} from './structured-decisions.mts'

// A recorded OpenRouter Decisions response, hand-written from the documented wire format (answers
// keyed by question id, no `id` inside a fragment, a Score `legend` and `probabilities` keyed by
// index), is replayed through the client's injected `fetch`, so the client decodes real response
// bytes. The live counterpart is the non-gating smoke check in structured-decisions.openrouter.test.mts.
const replay = createProviderReplay()

// The client's `fetch` returns an undici `Response`; the replay builds the global one.
const fetch: StructuredDecisionFetch = async (url, init) => {
  const recorded = await replay.fetch(url, init as RequestInit)
  return new UndiciResponse(await recorded.arrayBuffer(), {
    status: recorded.status,
    headers: recorded.headers,
  })
}

const request: StructuredDecisionRequest = {
  state: 'A short local food review about a bakery.',
  questions: [
    { id: 'spam', type: 'noul', question: 'Is this spam?' },
    {
      id: 'topic',
      type: 'choice',
      question: 'Choose the best topic.',
      criteria: ['food', 'sports'],
    },
    {
      id: 'quality',
      type: 'score',
      question: 'Score usefulness.',
      criteria: [
        { value: 0, description: 'low' },
        { value: 1, description: 'high' },
      ],
    },
  ],
}

describe('createStructuredDecisionClient against a recorded OpenRouter Decisions response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the native questions and decodes the recorded Noul, Choice and Score answers', async () => {
    replay.respondWith(loadRecordedResponse('openrouter/decisions-jev-completed.http'))
    const onBilledResponse = vi.fn<NonNullable<StructuredDecisionAttemptHooks['onBilledResponse']>>(
      () => Promise.resolve(),
    )
    const client = createStructuredDecisionClient({
      transport: 'openrouter',
      apiKey: 'test-key',
      fetch,
      hooks: { onBilledResponse },
    })

    const result = await client.decide(request)

    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({
      method: 'POST',
      headers: { authorization: 'Bearer test-key', 'content-type': 'application/json' },
    })
    expect(replay.requests[0]?.json()).toEqual({
      model: 'typesafe/jev-1.13',
      state: request.state,
      questions: {
        spam: {
          type: 'noul',
          instructions: 'Is this spam?',
          criteria: { false: 'No', true: 'Yes' },
        },
        topic: {
          type: 'choice',
          instructions: 'Choose the best topic.',
          criteria: { food: 'food', sports: 'sports' },
        },
        quality: { type: 'score', instructions: 'Score usefulness.', criteria: ['low', 'high'] },
      },
      provider: { only: ['TypeSafe'], allow_fallbacks: false },
    })

    expect(result.model).toBe('typesafe/jev-1.13-20260917')
    expect(result.provider).toBe('TypeSafe')
    // Request order, whatever order the provider keyed its answers in.
    expect(result.answers).toEqual([
      { id: 'spam', type: 'noul', probability: 0.07, raw: { type: 'noul', noul: 0.07 } },
      {
        id: 'topic',
        type: 'choice',
        choice: 'food',
        confidence: 0.94,
        probabilities: { food: 0.94, sports: 0.06 },
        raw: {
          type: 'choice',
          choice: 'food',
          confidence: 0.94,
          probabilities: { food: 0.94, sports: 0.06 },
        },
      },
      {
        id: 'quality',
        type: 'score',
        score: 0.65,
        confidence: 0.8,
        legend: ['low', 'high'],
        probabilities: { '0': 0.35, '1': 0.65 },
        raw: {
          type: 'score',
          score: 0.65,
          confidence: 0.8,
          legend: { '0': 'low', '1': 'high' },
          probabilities: { '0': 0.35, '1': 0.65 },
        },
      },
    ])
    // The fragments stay as the provider sent them: the decoder never synthesizes an `id`.
    for (const answer of result.answers) expect(answer.raw).not.toHaveProperty('id')
    // What the ledger writer reads comes straight from the recorded bytes.
    expect(result.raw).toMatchObject({ id: 'gen-dec-1790000000-replayfixture0001' })
    expect(result.usage).toEqual({ input_tokens: 476, output_tokens: 70, cost: 0.000019992 })
    expect(onBilledResponse).toHaveBeenCalledExactlyOnceWith({
      id: 'gen-dec-1790000000-replayfixture0001',
      model: 'typesafe/jev-1.13-20260917',
      usage: { input_tokens: 476, output_tokens: 70, cost: 0.000019992 },
      transport: 'openrouter',
      requestStartedAt: expect.any(Date),
    })
    replay.assertDrained()
  })
})
