import { beforeEach, describe, expect, it, vi } from 'vitest'
import { encodeFeatureFlagCookie, FF_COOKIE } from './shared'
import {
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

    expect(mockGetFeatureFlags).toHaveBeenCalledWith({ headers: { Cookie: '' } })
  })

  it('merges authenticated flags with cookie overrides and falls back on API errors', async () => {
    const cookie = encodeFeatureFlagCookie({ fediverse: true })
    mockCookies.mockResolvedValue({ get: () => ({ value: cookie }) })
    mockGetFeatureFlags.mockResolvedValueOnce({ flags: { memberships: true, fediverse: false } })

    await expect(getEffectiveServerFeatureFlags()).resolves.toEqual({
      memberships: true,
      fediverse: true,
    })

    mockGetFeatureFlags.mockRejectedValueOnce(new Error('offline'))
    await expect(getEffectiveServerFeatureFlag('fediverse')).resolves.toBe(true)
  })
})
