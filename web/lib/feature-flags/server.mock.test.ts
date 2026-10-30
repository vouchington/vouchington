import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeFeatureFlagCookie, FF_COOKIE } from './shared'
import { getEffectiveServerFeatureFlag, getGlobalServerFeatureFlags } from './server'

const { mockCookies, mockGetFeatureFlags } = vi.hoisted(() => ({
  mockCookies: vi.fn<VitestLooseMock>(),
  mockGetFeatureFlags: vi.fn<VitestLooseMock>(),
}))

vi.mock(import('next/headers'), () => ({
  cookies: mockCookies,
}))

vi.mock(import('@/lib/api/server/feature-flags'), () => ({
  getFeatureFlags: mockGetFeatureFlags,
}))

describe('server feature flag behavior', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mockCookies.mockReset()
    mockGetFeatureFlags.mockReset()
    mockCookies.mockResolvedValue({ get: () => undefined })
    mockGetFeatureFlags.mockResolvedValue({ flags: {} })
  })

  it('returns empty overrides when the feature flag cookie is missing', async () => {
    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(false)
  })

  it('parses cookie overrides with the server codec and max length env', async () => {
    const cookie = encodeFeatureFlagCookie({ fediverse: true, beta: false, 'mémé🚀': true })
    vi.stubEnv('FEATURE_FLAG_COOKIE_MAX_LENGTH', String(cookie.length + 1))
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === FF_COOKIE ? { value: cookie } : undefined),
    })

    mockGetFeatureFlags.mockResolvedValue({ flags: { fediverse: false, memberships: true } })
    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(true)
    await expect(getEffectiveServerFeatureFlag('memberships')).resolves.toBe(true)
  })

  it('drops oversized overrides when the public length is an SSM placeholder', async () => {
    const cookie = encodeFeatureFlagCookie({ fediverse: true })
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAG_COOKIE_MAX_LENGTH', 'PLACEHOLDER')
    vi.stubEnv('FEATURE_FLAG_COOKIE_MAX_LENGTH', String(cookie.length - 1))
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === FF_COOKIE ? { value: cookie } : undefined),
    })

    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(false)
  })

  it('applies only catalog flags from the cookie when global flags load', async () => {
    const cookie = encodeFeatureFlagCookie({
      fediverse: false,
      memberships: true,
      unknownFlag: true,
    })
    mockCookies.mockResolvedValue({ get: () => ({ value: cookie }) })
    mockGetFeatureFlags.mockResolvedValue({ flags: { memberships: false, fediverse: true } })

    await expect(getEffectiveServerFeatureFlag('memberships')).resolves.toBe(true)
    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(false)
    await expect(getEffectiveServerFeatureFlag('unknownFlag')).resolves.toBe(false)
  })

  it('strips feature-flag cookies when loading global flags', async () => {
    mockGetFeatureFlags.mockResolvedValue({ flags: { fediverse: false } })

    await expect(getGlobalServerFeatureFlags()).resolves.toEqual({ fediverse: false })

    expect(mockGetFeatureFlags).toHaveBeenCalledWith({
      headers: { Cookie: '', 'x-voucha-request-kind': 'global-feature-flags' },
    })
  })

  it('logs once and still resolves to an empty flag set when the global flag fetch fails', async () => {
    const fetchError = new Error('backend unreachable')
    mockGetFeatureFlags.mockRejectedValueOnce(fetchError)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    await expect(getGlobalServerFeatureFlags()).resolves.toEqual({})

    expect(consoleError).toHaveBeenCalledExactlyOnceWith(
      'getGlobalServerFeatureFlags: failed to read global feature flags',
      fetchError,
    )
    consoleError.mockRestore()
  })

  it('merges authenticated flags with cookie overrides and falls back on API errors', async () => {
    const cookie = encodeFeatureFlagCookie({ fediverse: true })
    mockCookies.mockResolvedValue({ get: () => ({ value: cookie }) })
    mockGetFeatureFlags.mockResolvedValue({ flags: { memberships: true, fediverse: false } })

    await expect(getEffectiveServerFeatureFlag('memberships')).resolves.toBe(true)
    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(true)

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetFeatureFlags.mockRejectedValueOnce(new Error('offline'))
    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(true)
    consoleError.mockRestore()
  })
})
