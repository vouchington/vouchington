import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeFeatureFlagCookie, FF_COOKIE } from './shared'
import {
  fetchGlobalServerFeatureFlags,
  getEffectiveServerFeatureFlag,
  getEffectiveServerFeatureFlags,
  getGlobalServerFeatureFlags,
  getServerFeatureFlagOverrides,
} from './server'

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

describe('server feature flag helpers', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
    mockCookies.mockReset()
    mockGetFeatureFlags.mockReset()
    mockCookies.mockResolvedValue({ get: () => undefined })
  })

  it('returns empty overrides when the feature flag cookie is missing', async () => {
    await expect(getServerFeatureFlagOverrides()).resolves.toEqual({})
  })

  it('parses cookie overrides with the server codec and max length env', async () => {
    const cookie = encodeFeatureFlagCookie({ fediverse: true, beta: false, 'mémé🚀': true })
    vi.stubEnv('FEATURE_FLAG_COOKIE_MAX_LENGTH', String(cookie.length + 1))
    mockCookies.mockResolvedValue({
      get: (name: string) => (name === FF_COOKIE ? { value: cookie } : undefined),
    })

    await expect(getServerFeatureFlagOverrides()).resolves.toEqual({
      fediverse: true,
      beta: false,
      'mémé🚀': true,
    })
  })

  it('merges global flags and anonymous cookie overrides', async () => {
    const cookie = encodeFeatureFlagCookie({ fediverse: true })
    mockCookies.mockResolvedValue({ get: () => ({ value: cookie }) })
    mockGetFeatureFlags.mockResolvedValueOnce({ flags: { memberships: true, fediverse: false } })

    await expect(getEffectiveServerFeatureFlags()).resolves.toEqual({
      memberships: true,
      fediverse: true,
    })
  })

  it('strips feature-flag cookies when loading global flags', async () => {
    mockGetFeatureFlags.mockResolvedValueOnce({ flags: { fediverse: false } })

    await expect(getGlobalServerFeatureFlags()).resolves.toEqual({ fediverse: false })

    expect(mockGetFeatureFlags).toHaveBeenCalledWith({
      headers: { Cookie: '', 'x-voucha-request-kind': 'global-feature-flags' },
    })
  })

  it('reports a rejected global flag fetch as a distinct failure, not an empty flag set', async () => {
    const fetchError = new Error('backend unreachable')
    mockGetFeatureFlags.mockRejectedValueOnce(fetchError)

    const result = await fetchGlobalServerFeatureFlags()

    // A structurally distinct failure result -- not `{}` -- so this assertion needs no console
    // spy: the rejection is directly observable on the returned value.
    expect(result).toEqual({ ok: false, error: fetchError })
  })

  it('reports a successful global flag fetch as a distinct success result', async () => {
    mockGetFeatureFlags.mockResolvedValueOnce({ flags: { fediverse: true } })

    const result = await fetchGlobalServerFeatureFlags()

    expect(result).toEqual({ ok: true, flags: { fediverse: true } })
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
    mockGetFeatureFlags.mockResolvedValueOnce({ flags: { memberships: true, fediverse: false } })

    await expect(getEffectiveServerFeatureFlags()).resolves.toEqual({
      memberships: true,
      fediverse: true,
    })

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockGetFeatureFlags.mockRejectedValueOnce(new Error('offline'))
    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(true)
    consoleError.mockRestore()
  })
})
