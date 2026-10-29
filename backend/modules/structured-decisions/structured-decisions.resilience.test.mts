import { Response } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionFetch,
} from './structured-decisions.mts'
import type { StructuredDecisionRequest } from '@vouchington/ai/structured-decisions'

const request: StructuredDecisionRequest = {
  state: 'A bakery review.',
  questions: [{ id: 'food', type: 'noul', question: 'Is this about food?' }],
}
const success = {
  model: 'typesafe/jev-1.13-20260917',
  provider: 'TypeSafe',
  usage: { input_tokens: 4, output_tokens: 1, cost: 0.00005 },
  answers: { food: { type: 'noul', noul: 0.9 } },
}
function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}
function client(fetch: StructuredDecisionFetch, hooks?: StructuredDecisionAttemptHooks) {
  return createStructuredDecisionClient({
    transport: 'openrouter',
    apiKey: 'test-key',
    fetch,
    hooks,
  })
}

describe('structured-decision resilience', () => {
  it('rejects malformed JSON on a 2xx response without retrying', async () => {
    const malformedFetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(new Response('{', { status: 200 }))
    await expect(client(malformedFetch).decide(request)).rejects.toMatchObject({
      code: 'invalid-response',
    })
    expect(malformedFetch).toHaveBeenCalledOnce()
  })

  it('does not retry ordinary 4xx responses or caller cancellation', async () => {
    const rejected = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response({}, 400))
    await expect(client(rejected).decide(request)).rejects.toMatchObject({ status: 400 })
    expect(rejected).toHaveBeenCalledOnce()

    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))
    const fetch = vi.fn<StructuredDecisionFetch>()
    await expect(client(fetch).decide(request, controller.signal)).rejects.toThrow(
      'caller cancelled',
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([
    ['Noul probability', { food: { type: 'noul', noul: 1.1 } }],
    [
      'Choice confidence',
      {
        food: {
          type: 'choice',
          choice: 'yes',
          confidence: -0.1,
          probabilities: { yes: 0.5, no: 0.5 },
        },
      },
    ],
  ])('rejects an out-of-range %s', async (_name, answers) => {
    const decisionRequest: StructuredDecisionRequest =
      _name === 'Choice confidence'
        ? {
            state: 'state',
            questions: [
              { id: 'food', type: 'choice', question: 'Choose.', criteria: ['yes', 'no'] },
            ],
          }
        : request
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(response({ ...success, answers }))
    await expect(client(fetch).decide(decisionRequest)).rejects.toMatchObject({
      code: 'invalid-response',
    })
  })

  it.each([
    ['provider', { ...success, provider: 'OtherProvider' }],
    ['model', { ...success, model: 'other-provider/jev-1.13' }],
  ])('fails closed for an unexpected %s identity', async (_name, body) => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response(body))
    await expect(client(fetch).decide(request)).rejects.toMatchObject({ code: 'invalid-response' })
  })

  it.each([
    { state: 1, questions: [] },
    { state: 'state', questions: [{ id: 'x', type: 'unknown', question: 'question' }] },
    { state: 'state', questions: [{ id: 'x', type: 'choice', question: 'question' }] },
    {
      state: 'state',
      questions: [
        { id: 'x', type: 'noul', question: 'question' },
        { id: 'x', type: 'noul', question: 'duplicate' },
      ],
    },
    {
      state: 'state',
      questions: [
        {
          id: 'score',
          type: 'score',
          question: 'question',
          criteria: [
            { value: 0, description: 'low' },
            { value: 2, description: 'high' },
          ],
        },
      ],
    },
    {
      state: 'state',
      questions: [
        {
          id: 'score',
          type: 'score',
          question: 'question',
          criteria: [
            { value: 0, description: 'same' },
            { value: 1, description: 'same' },
          ],
        },
      ],
    },
  ])('fails malformed runtime input as invalid-request', async malformed => {
    const fetch = vi.fn<StructuredDecisionFetch>()
    await expect(
      client(fetch).decide(malformed as unknown as StructuredDecisionRequest),
    ).rejects.toMatchObject({ code: 'invalid-request' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
