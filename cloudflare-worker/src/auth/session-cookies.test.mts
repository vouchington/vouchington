import { describe, expect, it } from 'vitest'
import { withEdgeSessionCookies } from './session-cookies.mts'

describe('withEdgeSessionCookies', () => {
  it('returns the original response for non-minted sessions', () => {
    const response = new Response('ok')

    expect(withEdgeSessionCookies(response, { kind: 'anon-passthrough' }, false)).toBe(response)
  })

  it('sets only a device cookie when only dt was minted', () => {
    const response = withEdgeSessionCookies(
      new Response('ok'),
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
    expect(setCookie).toContain('dt=device-token')
    expect(setCookie).not.toContain('st=session-token')
  })

  it('sets only a session cookie when only st was minted', () => {
    const response = withEdgeSessionCookies(
      new Response('ok'),
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
    expect(setCookie).toContain('st=session-token')
    expect(setCookie).not.toContain('dt=device-token')
    expect(setCookie).toContain('Secure')
  })
})
