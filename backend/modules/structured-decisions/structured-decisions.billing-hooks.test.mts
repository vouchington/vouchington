import { describe, expect, it, vi } from 'vitest'
import {
  bakeryStructuredDecisionRequest as request,
  makeOpenRouterStructuredDecisionBody as makeOpenRouterBody,
  makeStructuredDecisionResponse as makeResponse,
} from './structured-decisions-fixtures.mts'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionFetch,
} from './structured-decisions.mts'

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

  it.each([
    ['missing', undefined],
    ['null', null],
    ['an array', [12, 0]],
    ['missing output tokens', { input_tokens: 12 }],
    ['negative input tokens', { input_tokens: -1, output_tokens: 0 }],
    ['string token counts', { input_tokens: '12', output_tokens: '0' }],
  ])(
    'latches an unknown billed attempt instead of recording when usage is %s',
    async (_label, usage) => {
      const fetch = vi
        .fn<StructuredDecisionFetch>()
        .mockResolvedValue(makeResponse(makeOpenRouterBody({ usage })))
      const onBilledResponse = onBilledResponseMock().mockResolvedValue(undefined)
      const onUnknownBilledAttempt =
        vi.fn<NonNullable<StructuredDecisionAttemptHooks['onUnknownBilledAttempt']>>()
      const client = createStructuredDecisionClient({
        transport: 'openrouter',
        apiKey: 'test-key',
        fetch,
        hooks: { onBilledResponse, onUnknownBilledAttempt },
      })

      await expect(client.decide(request)).rejects.toMatchObject({
        code: 'invalid-response',
        message: 'Provider response did not contain readable usage.',
      })

      expect(onBilledResponse).not.toHaveBeenCalled()
      expect(onUnknownBilledAttempt).toHaveBeenCalledOnce()
      expect(onUnknownBilledAttempt).toHaveBeenCalledWith(
        expect.objectContaining({
          requestStartedAt: expect.any(Date),
          error: expect.objectContaining({ code: 'invalid-response' }),
        }),
      )
    },
  )
})
