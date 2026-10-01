import { Response } from 'undici'
import { describe, expect, it, vi } from 'vitest'
import {
  bakeryStructuredDecisionRequest,
  makeStructuredDecisionResponse,
} from './structured-decisions-fixtures.mts'
import {
  createStructuredDecisionClient,
  StructuredDecisionError,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionFetch,
} from './structured-decisions.mts'

const FLAGGED_INPUT = 'a private message the user wrote that must never reach a log'

function decide(
  fetch: StructuredDecisionFetch,
  hooks?: StructuredDecisionAttemptHooks,
): Promise<unknown> {
  return createStructuredDecisionClient({
    transport: 'openrouter',
    apiKey: 'test-key',
    fetch,
    hooks,
  }).decide(bakeryStructuredDecisionRequest)
}

async function failureOf(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<StructuredDecisionError> {
  const fetch = vi
    .fn<StructuredDecisionFetch>()
    .mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
    )
  const error = await decide(fetch).catch((caught: unknown) => caught)
  expect(fetch).toHaveBeenCalledOnce()
  expect(error).toBeInstanceOf(StructuredDecisionError)
  return error as StructuredDecisionError
}

describe('structured-decision provider failure', () => {
  it('keeps the provider code and message on the error, never the flagged input', async () => {
    const error = await failureOf(403, {
      error: {
        code: 403,
        message: `Input flagged: ${FLAGGED_INPUT}`,
        metadata: {
          reasons: ['harassment'],
          flagged_input: FLAGGED_INPUT,
          provider_name: 'OpenAI',
          model_slug: 'openai/gpt-5',
        },
      },
    })
    expect(error).toMatchObject({
      code: 'provider-error',
      status: 403,
      retryClass: 'permanent',
      detail: { code: 403, providerName: 'OpenAI', modelSlug: 'openai/gpt-5', moderation: true },
    })
    // `String(error)` carries the message, which is what a log line or Sentry event would show.
    expect(String(error)).not.toContain(FLAGGED_INPUT)
    expect(JSON.stringify(error)).not.toContain(FLAGGED_INPUT)
    expect(JSON.stringify(error.detail)).not.toContain('flagged_input')
    // Sentry serializes a `cause` too: a rejected response has none, so no body can ride along.
    expect(error.cause).toBeUndefined()
  })

  it('classifies an outage 403 as transient and a moderation 403 as permanent', async () => {
    const outage = await failureOf(403, {
      error: {
        code: 403,
        message: 'Provider returned error',
        metadata: { provider_name: 'Azure' },
      },
    })
    expect(outage).toMatchObject({ retryClass: 'transient', detail: { moderation: false } })

    const moderation = await failureOf(403, {
      error: { code: 403, message: 'flagged', metadata: { reasons: ['violence'] } },
    })
    expect(moderation).toMatchObject({ retryClass: 'permanent', detail: { moderation: true } })
  })

  it.each([
    [401, 'permanent'],
    [400, 'permanent'],
    [402, 'permanent'],
    [408, 'transient'],
    [429, 'transient'],
    [502, 'transient'],
    [503, 'transient'],
  ])('classifies HTTP %i from its status when the body says nothing: %s', async (status, kind) => {
    const error = await failureOf(status, '<html>gateway</html>')
    expect(error).toMatchObject({ code: 'provider-error', status, retryClass: kind })
    expect(error.detail).toBeUndefined()
  })

  it('treats the in-flight budget 402 as transient and honours its Retry-After', async () => {
    const error = await failureOf(
      402,
      {
        error: {
          code: 402,
          message: 'Budget',
          metadata: { limit_source: 'openrouter_in_flight_budget' },
        },
      },
      { 'retry-after': '45' },
    )
    expect(error).toMatchObject({ retryClass: 'transient', retryAfterMs: 45_000 })
  })

  it('carries Retry-After on a transient 429 or 503 and none on a permanent failure', async () => {
    expect(await failureOf(429, {}, { 'retry-after': '7' })).toMatchObject({
      retryClass: 'transient',
      retryAfterMs: 7_000,
    })
    expect((await failureOf(503, {}, { 'retry-after': '2' })).retryAfterMs).toBe(2_000)
    expect((await failureOf(401, {}, { 'retry-after': '2' })).retryAfterMs).toBeUndefined()
  })

  it('treats a connection failure as a transient provider error', async () => {
    const cause = Object.assign(new Error('reset'), { code: 'ECONNRESET' })
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockRejectedValue(new TypeError('fetch', { cause }))
    await expect(decide(fetch)).rejects.toMatchObject({
      code: 'provider-error',
      status: undefined,
      retryClass: 'transient',
    })
  })

  it('does not classify a malformed 2xx as a provider failure', async () => {
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(makeStructuredDecisionResponse({ not: 'a decision' }))
    const error = await decide(fetch).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ code: 'invalid-response', retryClass: undefined })
  })

  it('still latches the billed attempt and throws a provider error when the body cannot be read', async () => {
    const unreadable = new Response(
      new ReadableStream({
        start(controller) {
          controller.error(new Error('connection reset'))
        },
      }),
      { status: 503 },
    )
    const onUnknownBilledAttempt = vi
      .fn<NonNullable<StructuredDecisionAttemptHooks['onUnknownBilledAttempt']>>()
      .mockResolvedValue(undefined)
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(unreadable)

    await expect(decide(fetch, { onUnknownBilledAttempt })).rejects.toMatchObject({
      code: 'provider-error',
      status: 503,
      retryClass: 'transient',
    })
    expect(onUnknownBilledAttempt).toHaveBeenCalledOnce()
  })

  // The spend-cap latch follows the billing status rules alone (#652), never the retry class: a
  // transient outage 403 does not latch, while a 409 is permanent to retry yet still latches.
  it.each([
    [
      'a transient outage 403',
      403,
      { error: { code: 403, message: 'Provider returned error' } },
      0,
    ],
    ['a permanent 401', 401, {}, 0],
    ['a transient 429', 429, {}, 1],
    ['a permanent 409', 409, {}, 1],
  ])('latches %s the number of times the billing rules say', async (_name, status, body, times) => {
    const onUnknownBilledAttempt = vi
      .fn<NonNullable<StructuredDecisionAttemptHooks['onUnknownBilledAttempt']>>()
      .mockResolvedValue(undefined)
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(makeStructuredDecisionResponse(body, status))
    await decide(fetch, { onUnknownBilledAttempt }).catch(() => undefined)
    expect(onUnknownBilledAttempt).toHaveBeenCalledTimes(times)
  })
})
