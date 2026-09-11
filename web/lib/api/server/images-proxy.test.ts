import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordProxyReferralAttribution, refreshProxySession } from './proxy'

describe('server proxy api helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('rejects unsupported backend URL protocols before proxy attribution fetch', async () => {
    await expect(
      recordProxyReferralAttribution(
        'ftp://backend.example.com',
        { referrer: 'https://example.com', landing_url: 'https://example.com/landing' },
        { dt: 'dt', st: 'st' },
        {},
      ),
    ).rejects.toThrow('Unsupported backend URL protocol: ftp:')
  })

  it('adds web client metadata to session refresh requests', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: null }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)
    vi.stubEnv('NEXT_PUBLIC_GIT_COMMIT', 'web-release')

    await refreshProxySession(
      'https://backend.example.com',
      { dt: 'device-token', st: 'session-token' },
      {},
    )

    const [, init] = mockFetch.mock.calls[0]!
    expect(init?.headers).toMatchObject({
      Origin: 'https://backend.example.com',
      'x-forwarded-proto': 'https',
      'x-voucha-app-version': 'web-release',
      'x-voucha-client': 'web',
      'x-voucha-platform': 'web',
      cookie: 'dt=device-token; st=session-token',
    })
  })

  it('uses the internal backend protocol for session refresh origin validation', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: null }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await refreshProxySession('http://backend:2900', { dt: 'dt', st: 'st' }, {})

    expect(mockFetch.mock.calls[0]?.[1]?.headers).toMatchObject({
      Origin: 'http://backend:2900',
      'x-forwarded-proto': 'http',
    })
  })

  it('omits the session cookie when refresh has no tokens', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ session: null }), { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    await refreshProxySession('https://backend.example.com', {}, {})

    const [, init] = mockFetch.mock.calls[0]!
    expect(init?.headers).not.toHaveProperty('cookie')
  })

  it('adds web client metadata to referral attribution requests', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    await recordProxyReferralAttribution(
      'https://backend.example.com',
      { referrer: 'alice', landing_url: 'https://voucha.ai/landing/alice' },
      { dt: 'dt', st: 'st' },
      { 'x-forwarded-for': '203.0.113.5' },
    )

    const [, init] = mockFetch.mock.calls[0]!
    expect(init?.headers).toMatchObject({
      'x-voucha-app-version': 'development',
      'x-voucha-client': 'web',
      'x-voucha-platform': 'web',
      'x-forwarded-for': '203.0.113.5',
    })
  })
})
