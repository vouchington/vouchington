import { Response } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  createStructuredDecisionClient,
  type StructuredDecisionFetch,
  type StructuredDecisionRequest,
  type StructuredDecisionSleep,
} from './structured-decisions.mts'

const request: StructuredDecisionRequest = {
  state: 'A bakery review.',
  questions: [{ id: 'food', type: 'noul', question: 'Is this about food?' }],
}
const success = {
  model: 'typesafe/jev-1.13-20260917',
  provider: 'TypeSafe',
  answers: { food: { type: 'noul', noul: 0.9 } },
}
function response(body: unknown, status = 200, retryAfter?: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: retryAfter ? { 'retry-after': retryAfter } : undefined,
  })
}
function client(fetch: StructuredDecisionFetch, sleep: StructuredDecisionSleep = async () => {}) {
  return createStructuredDecisionClient({
    transport: 'openrouter',
    apiKey: 'test-key',
    fetch,
    sleep,
  })
}

describe('structured-decision resilience', () => {
  it('retries nested Undici network failures and preserves the exhausted cause', async () => {
    const cause = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    const failure = new TypeError('fetch failed', { cause })
    const fetch = vi.fn<StructuredDecisionFetch>().mockRejectedValue(failure)
    const sleep = vi.fn<StructuredDecisionSleep>().mockResolvedValue(undefined)

    await expect(client(fetch, sleep).decide(request)).rejects.toMatchObject({
      code: 'provider-error',
      cause: failure,
    })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('retries a response-body timeout but rejects malformed JSON without retrying', async () => {
    const timedOut = response(success)
    vi.spyOn(timedOut, 'json').mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'))
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValueOnce(timedOut)
      .mockResolvedValueOnce(response(success))
    await expect(client(fetch).decide(request)).resolves.toMatchObject({ provider: 'TypeSafe' })
    expect(fetch).toHaveBeenCalledTimes(2)

    const malformedFetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(new Response('{', { status: 200 }))
    await expect(client(malformedFetch).decide(request)).rejects.toMatchObject({
      code: 'invalid-response',
    })
    expect(malformedFetch).toHaveBeenCalledOnce()
  })

  it.each([
    ['delta seconds', '2'],
    ['HTTP date', new Date(Date.now() + 2_000).toUTCString()],
  ])('honors %s Retry-After and cancels the rejected body', async (_name, retryAfter) => {
    const rejected = response({ error: 'busy' }, 429, retryAfter)
    const cancel = vi.spyOn(rejected.body!, 'cancel')
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValueOnce(rejected)
      .mockResolvedValueOnce(response(success))
    const sleep = vi.fn<StructuredDecisionSleep>().mockResolvedValue(undefined)

    await client(fetch, sleep).decide(request)
    expect(cancel).toHaveBeenCalledOnce()
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThan(0)
    expect(sleep.mock.calls[0]?.[0]).toBeLessThanOrEqual(5_000)
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

  it('propagates caller cancellation during a retry delay', async () => {
    const controller = new AbortController()
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response({}, 529))
    const sleep = vi.fn<StructuredDecisionSleep>().mockImplementation(
      (_duration, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
          queueMicrotask(() => controller.abort(new Error('cancelled during retry delay')))
        }),
    )
    await expect(client(fetch, sleep).decide(request, controller.signal)).rejects.toThrow(
      'cancelled during retry delay',
    )
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('supports completion and cancellation with the default retry delay', async () => {
    vi.useFakeTimers()
    try {
      const completes = vi
        .fn<StructuredDecisionFetch>()
        .mockResolvedValueOnce(response({}, 529))
        .mockResolvedValueOnce(response(success))
      const completion = createStructuredDecisionClient({
        transport: 'openrouter',
        apiKey: 'test-key',
        fetch: completes,
      }).decide(request)
      await vi.advanceTimersByTimeAsync(100)
      await expect(completion).resolves.toMatchObject({ provider: 'TypeSafe' })

      const controller = new AbortController()
      const cancelled = vi.fn<StructuredDecisionFetch>().mockResolvedValue(response({}, 529))
      const cancellation = createStructuredDecisionClient({
        transport: 'openrouter',
        apiKey: 'test-key',
        fetch: cancelled,
      }).decide(request, controller.signal)
      const rejection = expect(cancellation).rejects.toThrow('default delay cancelled')
      await vi.advanceTimersByTimeAsync(0)
      controller.abort(new Error('default delay cancelled'))
      await rejection
      expect(cancelled).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
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
