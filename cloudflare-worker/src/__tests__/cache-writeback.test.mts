import { describe, expect, it } from 'vitest'
import { finalizeOriginResponse } from '../cache-writeback.mts'

const baseArgs = {
  edgeSession: { kind: 'anon-passthrough' } as const,
  fetchDuration: 42,
  forceNoStore: false,
  isProduction: false,
  originResponse: new Response('ok'),
}

describe('finalizeOriginResponse', () => {
  it('always marks the response x-voucha-cache: BYPASS', () => {
    const response = finalizeOriginResponse(baseArgs)

    expect(response.headers.get('x-voucha-cache')).toBe('BYPASS')
  })

  it('sets server-timing from the measured origin fetch duration', () => {
    const response = finalizeOriginResponse({ ...baseArgs, fetchDuration: 123 })

    expect(response.headers.get('server-timing')).toBe('origin;dur=123')
  })

  it('never exposes an origin-supplied internal cache Vary marker on BYPASS', () => {
    const response = finalizeOriginResponse({
      ...baseArgs,
      originResponse: new Response('ok', {
        headers: {
          'x-voucha-cache-vary': 'Cookie, Authorization',
          'x-origin-metadata': 'preserved',
        },
      }),
    })

    expect(response.headers.get('x-voucha-cache-vary')).toBeNull()
    expect(response.headers.get('x-origin-metadata')).toBe('preserved')
  })

  it('preserves multiple origin Set-Cookie headers while sanitizing internal headers', () => {
    const headers = new Headers()
    headers.append('set-cookie', 'st=session; Path=/; HttpOnly')
    headers.append('set-cookie', 'dt=device; Path=/; HttpOnly')
    headers.set('x-voucha-cache-vary', 'Cookie, Authorization')

    const response = finalizeOriginResponse({
      ...baseArgs,
      originResponse: new Response('ok', { headers }),
    })

    const setCookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')]
    expect(response.headers.get('x-voucha-cache-vary')).toBeNull()
    expect(setCookies.some(cookie => cookie?.startsWith('st=session'))).toBe(true)
    expect(setCookies.some(cookie => cookie?.startsWith('dt=device'))).toBe(true)
  })

  it('applies no-store failure headers on a >=400 origin response', () => {
    const response = finalizeOriginResponse({
      ...baseArgs,
      originResponse: new Response('not found', { status: 404 }),
    })

    expect(response.status).toBe(404)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
  })

  it('applies no-store headers when the bypass policy marks a route as private', () => {
    const response = finalizeOriginResponse({
      ...baseArgs,
      forceNoStore: true,
      originResponse: new Response('private', {
        headers: { 'cache-control': 'public, max-age=300' },
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(response.headers.get('cdn-cache-control')).toBe('no-store')
    expect(response.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
  })

  it('applies minted session cookies from an anon-minted edge session', () => {
    const response = finalizeOriginResponse({
      ...baseArgs,
      edgeSession: {
        kind: 'anon-minted',
        dt: 'device-token',
        st: 'session-token',
        mintedDt: true,
        mintedSt: true,
      },
      isProduction: true,
    })

    const setCookies = response.headers.getSetCookie?.() ?? [response.headers.get('set-cookie')]
    expect(setCookies.some(cookie => cookie?.startsWith('dt=device-token'))).toBe(true)
    expect(setCookies.some(cookie => cookie?.startsWith('st=session-token'))).toBe(true)
  })

  it('does not add cookies for an anon-passthrough edge session', () => {
    const response = finalizeOriginResponse(baseArgs)

    expect(response.headers.get('set-cookie')).toBeNull()
  })
})
