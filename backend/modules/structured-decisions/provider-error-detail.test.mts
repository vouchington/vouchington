import { Response } from 'undici'
import { describe, expect, it } from 'vitest'
import { describeProviderErrorDetail, readProviderErrorDetail } from './provider-error-detail.mts'

function jsonResponse(body: unknown, status = 403): Response {
  return new Response(JSON.stringify(body), { status })
}

const FLAGGED_INPUT = 'my neighbour is a terrible person and I will find where they live'

describe('readProviderErrorDetail', () => {
  it('keeps the code, a bounded message and the safe metadata keys', async () => {
    const detail = await readProviderErrorDetail(
      jsonResponse({
        error: {
          code: 403,
          message: 'Provider returned error',
          metadata: {
            error_type: 'provider_unavailable',
            provider_code: 'upstream_503',
            reasons: ['capacity'],
            provider_name: 'Anthropic',
            model_slug: 'anthropic/claude-haiku',
            limit_source: 'openrouter_in_flight_budget',
            raw: { secret: 'not kept' },
          },
        },
      }),
    )
    expect(detail).toEqual({
      code: 403,
      message: 'Provider returned error',
      errorType: 'provider_unavailable',
      providerCode: 'upstream_503',
      reasons: ['capacity'],
      providerName: 'Anthropic',
      modelSlug: 'anthropic/claude-haiku',
      limitSource: 'openrouter_in_flight_budget',
      moderation: true,
      guardrail: false,
    })
  })

  it('never keeps flagged_input, and cuts an echo of it from the message', async () => {
    const detail = await readProviderErrorDetail(
      jsonResponse({
        error: {
          code: 403,
          message: `Input flagged: "${FLAGGED_INPUT}" violates the policy`,
          metadata: {
            reasons: ['harassment'],
            flagged_input: FLAGGED_INPUT,
            provider_name: 'OpenAI',
            model_slug: 'openai/gpt-5',
          },
        },
      }),
    )
    expect(detail?.moderation).toBe(true)
    expect(detail?.reasons).toEqual(['harassment'])
    const kept = JSON.stringify(detail)
    expect(kept).not.toContain('flagged_input')
    expect(kept).not.toContain('terrible person')
    expect(detail?.message).toBe('Input flagged: "[redacted]" violates the policy')
  })

  it('cuts the middle-truncated fragments of a long flagged_input from the message', async () => {
    const detail = await readProviderErrorDetail(
      jsonResponse({
        error: {
          code: 403,
          message: 'Flagged: the first words of it...the last words of it',
          metadata: { flagged_input: 'the first words of it...the last words of it' },
        },
      }),
    )
    expect(detail?.message).toBe('Flagged: [redacted]')
  })

  it('marks a guardrail block by the presence of its patterns and never keeps them', async () => {
    const detail = await readProviderErrorDetail(
      jsonResponse({
        error: {
          code: 403,
          message: 'Blocked by a guardrail',
          metadata: { patterns: ['credit-card-number'] },
        },
      }),
    )
    expect(detail).toMatchObject({ guardrail: true, moderation: false })
    expect(JSON.stringify(detail)).not.toContain('credit-card-number')
  })

  it('bounds the message, the fields and the reasons', async () => {
    const detail = await readProviderErrorDetail(
      jsonResponse({
        error: {
          code: 'x'.repeat(500),
          message: 'word '.repeat(500),
          metadata: {
            error_type: 'e'.repeat(500),
            provider_name: 'p'.repeat(500),
            reasons: Array.from({ length: 50 }, (_, index) => `reason-${index}`),
          },
        },
      }),
    )
    expect(String(detail?.code)).toHaveLength(64)
    expect(detail?.message).toHaveLength(200)
    expect(detail?.errorType).toHaveLength(64)
    expect(detail?.providerName).toHaveLength(64)
    expect(detail?.reasons).toHaveLength(8)
  })

  it.each([
    ['non-JSON text', new Response('<html>Bad gateway</html>', { status: 502 })],
    ['an empty body', new Response(null, { status: 503 })],
    ['a JSON string', jsonResponse('upstream down', 502)],
    ['a JSON array', jsonResponse([1, 2], 502)],
    ['an error that is not an object', jsonResponse({ error: 'x' }, 500)],
    ['an oversized body', new Response(`{"error":{"message":"${'x'.repeat(20_000)}"}}`)],
    [
      'a body that fails mid-read',
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error('connection reset'))
          },
        }),
        { status: 503 },
      ),
    ],
  ])('yields no detail for %s, without throwing', async (_name, response) => {
    await expect(readProviderErrorDetail(response)).resolves.toBeUndefined()
  })

  it('keeps nothing for an error object with no usable fields except the classification flags', async () => {
    await expect(readProviderErrorDetail(jsonResponse({ error: {} }))).resolves.toEqual({
      moderation: false,
      guardrail: false,
    })
  })
})

describe('describeProviderErrorDetail', () => {
  it('summarises the code, types and message on one line', () => {
    expect(
      describeProviderErrorDetail({
        code: 403,
        errorType: 'provider_unavailable',
        providerCode: 'upstream_503',
        message: 'Provider returned error',
        moderation: false,
        guardrail: false,
      }),
    ).toBe(
      'code 403, type provider_unavailable, provider code upstream_503: Provider returned error',
    )
  })

  it('is empty when nothing is known', () => {
    expect(describeProviderErrorDetail({ moderation: false, guardrail: false })).toBe('')
  })
})
