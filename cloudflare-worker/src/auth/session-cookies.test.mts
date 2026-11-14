import { describe, expect, it } from 'vitest'
import { withEdgeSessionCookies } from './session-cookies.mts'

describe('withEdgeSessionCookies', () => {
  it('returns the original response for non-minted sessions', () => {
    const response = new Response('ok')

    expect(withEdgeSessionCookies(response, { kind: 'anon-passthrough' }, false)).toBe(response)
  })

  it('sets only a device cookie when only dt was minted', () => {
    const response = withEdgeSessionCookies(
      new Response('ok', { headers: { 'cache-control': 'public, max-age=30' } }),
      {
        kind: 'anon-minted',
        dt: 'device-token',
        st: 'session-token',
        mintedDt: true,
        mintedSt: false,
      },
      false,
    )

    const setCookie = response.headers.get('set-cookie')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(setCookie).toContain('dt=device-token')
    expect(setCookie).not.toContain('st=session-token')
  })

  it('sets only a session cookie when only st was minted', () => {
    const response = withEdgeSessionCookies(
      new Response('ok', { headers: { 'cache-control': 'public, max-age=30' } }),
      {
        kind: 'anon-minted',
        dt: 'device-token',
        st: 'session-token',
        mintedDt: false,
        mintedSt: true,
      },
      true,
    )

    const setCookie = response.headers.get('set-cookie')
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(setCookie).toContain('st=session-token')
    expect(setCookie).not.toContain('dt=device-token')
    expect(setCookie).toContain('Secure')
  })

  it('preserves cacheability when neither cookie was actually minted', () => {
    const original = new Response('ok', { headers: { 'cache-control': 'public, max-age=30' } })
    const response = withEdgeSessionCookies(
      original,
      {
        kind: 'anon-minted',
        dt: 'device-token',
        st: 'session-token',
        mintedDt: false,
        mintedSt: false,
      },
      false,
    )

    expect(response).toBe(original)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(response.headers.get('cache-control')).toBe('public, max-age=30')
  })
})
