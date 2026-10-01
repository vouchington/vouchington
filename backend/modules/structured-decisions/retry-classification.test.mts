import { Response } from 'undici'
import { describe, expect, it } from 'vitest'
import { classifyProviderFailure, classifyProviderResponse } from './retry-classification.mts'
import type { ProviderErrorDetail, StructuredDecisionRetryClass } from './types.mts'

const none = { moderation: false, guardrail: false } satisfies ProviderErrorDetail
const moderation = { ...none, moderation: true, reasons: ['harassment'] }
const guardrail = { ...none, guardrail: true }
const outage: ProviderErrorDetail = { ...none, message: 'Provider returned error' }
const inFlightBudget: ProviderErrorDetail = { ...none, limitSource: 'openrouter_in_flight_budget' }
const otherLimit: ProviderErrorDetail = { ...none, limitSource: 'key_limit' }

describe('classifyProviderFailure on OpenRouter', () => {
  it.each<[string, number, ProviderErrorDetail | undefined, StructuredDecisionRetryClass]>([
    ['400 bad request', 400, undefined, 'permanent'],
    ['401 rejected key', 401, undefined, 'permanent'],
    ['402 out of credits', 402, undefined, 'permanent'],
    ['402 with another limit', 402, otherLimit, 'permanent'],
    ['402 in-flight budget', 402, inFlightBudget, 'transient'],
    ['403 moderation', 403, moderation, 'permanent'],
    ['403 guardrail', 403, guardrail, 'permanent'],
    ['403 provider outage', 403, outage, 'transient'],
    ['403 with no body', 403, undefined, 'transient'],
    ['408 timeout', 408, undefined, 'transient'],
    ['429 rate limit', 429, undefined, 'transient'],
    ['502 bad gateway', 502, undefined, 'transient'],
    ['503 unavailable', 503, undefined, 'transient'],
    ['404 not found', 404, undefined, 'permanent'],
    ['409 conflict', 409, undefined, 'permanent'],
    ['422 unprocessable', 422, undefined, 'permanent'],
    ['500 server error', 500, undefined, 'transient'],
    ['504 gateway timeout', 504, undefined, 'transient'],
    ['529 overloaded', 529, undefined, 'transient'],
  ])('%s is %s', (_name, status, detail, expected) => {
    expect(classifyProviderFailure('openrouter', status, detail)).toBe(expected)
  })

  it('treats a connection failure, which has no status, as transient', () => {
    expect(classifyProviderFailure('openrouter', undefined, undefined)).toBe('transient')
  })
})

describe('classifyProviderFailure on TypeSafe', () => {
  it.each<[number, StructuredDecisionRetryClass]>([
    [400, 'permanent'],
    [401, 'permanent'],
    [402, 'permanent'],
    [403, 'permanent'],
    [404, 'permanent'],
    [408, 'transient'],
    [429, 'transient'],
    [500, 'transient'],
    [503, 'transient'],
  ])('classifies %i by status alone as %s', (status, expected) => {
    // A body that would make an OpenRouter 403 transient never changes TypeSafe's status rule.
    expect(classifyProviderFailure('typesafe', status, outage)).toBe(expected)
  })
})

describe('classifyProviderResponse', () => {
  function respond(status: number, retryAfter?: string): Response {
    return new Response(null, {
      status,
      headers: retryAfter === undefined ? {} : { 'retry-after': retryAfter },
    })
  }

  it('carries a Retry-After in milliseconds on a transient failure', () => {
    expect(classifyProviderResponse('openrouter', respond(429, '12'), undefined)).toEqual({
      retryClass: 'transient',
      retryAfterMs: 12_000,
    })
    expect(classifyProviderResponse('openrouter', respond(503, '1'), outage)).toEqual({
      retryClass: 'transient',
      retryAfterMs: 1_000,
      detail: outage,
    })
    expect(
      classifyProviderResponse('openrouter', respond(402, '30'), inFlightBudget),
    ).toMatchObject({
      retryClass: 'transient',
      retryAfterMs: 30_000,
    })
  })

  it('reads a Retry-After HTTP date', () => {
    const at = new Date(Date.now() + 60_000).toUTCString()
    const { retryAfterMs } = classifyProviderResponse('openrouter', respond(503, at), undefined)
    expect(retryAfterMs).toBeGreaterThan(0)
    expect(retryAfterMs).toBeLessThanOrEqual(60_000)
  })

  it('omits an absent or unreadable Retry-After', () => {
    expect(classifyProviderResponse('openrouter', respond(503), undefined)).toEqual({
      retryClass: 'transient',
    })
    expect(classifyProviderResponse('openrouter', respond(503, 'soon'), undefined)).toEqual({
      retryClass: 'transient',
    })
  })

  it('never carries a Retry-After on a permanent failure', () => {
    expect(classifyProviderResponse('openrouter', respond(401, '30'), undefined)).toEqual({
      retryClass: 'permanent',
    })
    expect(classifyProviderResponse('openrouter', respond(403, '30'), moderation)).toEqual({
      retryClass: 'permanent',
      detail: moderation,
    })
  })
})
