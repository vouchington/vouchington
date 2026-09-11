import { describe, expect, it } from 'vitest'
import { isCacheableResponse } from '../cache-policy.mts'

describe('isCacheableResponse', () => {
  it('returns true for 2xx responses without set-cookie', () => {
    expect(isCacheableResponse(new Response('ok', { status: 200 }))).toBe(true)
    expect(isCacheableResponse(new Response('ok', { status: 201 }))).toBe(true)
    expect(isCacheableResponse(new Response(null, { status: 204 }))).toBe(true)
  })

  it('returns false for 4xx responses', () => {
    expect(isCacheableResponse(new Response('not found', { status: 404 }))).toBe(false)
    expect(isCacheableResponse(new Response('forbidden', { status: 403 }))).toBe(false)
  })

  it('returns false for 5xx responses', () => {
    expect(isCacheableResponse(new Response('error', { status: 500 }))).toBe(false)
    expect(isCacheableResponse(new Response('error', { status: 503 }))).toBe(false)
  })

  it('returns false for 3xx responses', () => {
    expect(
      isCacheableResponse(new Response(null, { status: 301, headers: { location: '/new' } })),
    ).toBe(false)
  })

  it('returns false for 2xx responses with set-cookie header', () => {
    expect(
      isCacheableResponse(
        new Response('ok', { status: 200, headers: { 'set-cookie': 'session=abc; Path=/' } }),
      ),
    ).toBe(false)
  })

  it('returns false for private cache-control responses', () => {
    expect(
      isCacheableResponse(
        new Response('private', {
          status: 200,
          headers: { 'cache-control': 'private, max-age=300' },
        }),
      ),
    ).toBe(false)
  })

  it('returns false for no-store and no-cache responses', () => {
    expect(
      isCacheableResponse(new Response('no-store', { headers: { 'cache-control': 'no-store' } })),
    ).toBe(false)
    expect(
      isCacheableResponse(
        new Response('no-cache', { headers: { 'cache-control': 'public, no-cache' } }),
      ),
    ).toBe(false)
  })
})
