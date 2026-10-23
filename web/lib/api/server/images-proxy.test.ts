import { afterEach, describe, expect, it, vi } from 'vitest'
import { recordProxyReferralAttribution, getProxyClientHeaders } from './proxy'

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

  it('adds web client metadata to referral attribution requests', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', mockFetch)

    await recordProxyReferralAttribution(
      'https://backend.example.com',
      { referrer: 'alice', landing_url: 'https://voucha.ai/landing/alice' },
      { dt: 'dt', st: 'st' },
      getProxyClientHeaders({
        headers: new Headers({
          'user-agent': 'Browser/127',
          'x-forwarded-for': '203.0.113.5',
          'cf-connecting-ip': '198.51.100.8',
          'x-voucha-client': 'swift',
          authorization: 'Bearer untrusted-forwarded-value',
        }),
      }),
    )

    const [, init] = mockFetch.mock.calls[0]!
    expect(init?.headers).toMatchObject({
      'x-voucha-app-version': 'development',
      'x-voucha-client': 'web',
      'x-voucha-platform': 'web',
      'x-forwarded-for': '203.0.113.5',
      'cf-connecting-ip': '198.51.100.8',
      'user-agent': 'Browser/127',
    })
    expect(init?.headers).not.toHaveProperty('authorization')
  })
})
