import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  closeScopedDynamicConfigContext,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers/dynamic-config'
import {
  getOAuthAuthorizationBrokerCapabilities,
  isOAuthAuthorizationBrokerEnabled,
  oauthAuthorizationBrokerConfig,
  assertBrokerOAuthProvider,
} from '../broker-config.mts'

describe('OAuth authorization broker config', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await closeScopedDynamicConfigContext([oauthAuthorizationBrokerConfig])
  })

  it('fails closed for every provider and callback mode', () => {
    expect(getOAuthAuthorizationBrokerCapabilities()).toEqual({
      facebook: {
        version: 1,
        modes: { web: false, native: false },
        purposes: ['authenticate', 'connect'],
      },
      x: {
        version: 1,
        modes: { web: false, native: false },
        purposes: ['authenticate', 'connect'],
      },
      github: {
        version: 1,
        modes: { web: false, native: false },
        purposes: ['authenticate', 'connect'],
      },
      linkedin: {
        version: 1,
        modes: { web: false, native: false },
        purposes: ['authenticate', 'connect'],
      },
      microsoft: {
        version: 1,
        modes: { web: false, native: false },
        purposes: ['authenticate', 'connect'],
      },
      google: {
        version: 1,
        modes: { web: false, native: false },
        purposes: ['authenticate', 'connect'],
      },
    })
  })

  it('enables only the exact provider and callback mode selected by an operator', () => {
    overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
      github_native_enabled: true,
    })

    expect(isOAuthAuthorizationBrokerEnabled('github', 'native', ['github'])).toBe(true)
    expect(isOAuthAuthorizationBrokerEnabled('github', 'web', ['github'])).toBe(false)
    expect(isOAuthAuthorizationBrokerEnabled('facebook', 'native', ['github'])).toBe(false)
  })

  it('keeps flagged modes unavailable until all provider credentials are configured', () => {
    overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
      github_web_enabled: true,
    })

    expect(isOAuthAuthorizationBrokerEnabled('github', 'web', [])).toBe(false)
    expect(getOAuthAuthorizationBrokerCapabilities([]).github.modes.web).toBe(false)
    expect(getOAuthAuthorizationBrokerCapabilities(['github']).github.modes.web).toBe(true)
  })

  it('accepts only broker-supported providers', () => {
    expect(assertBrokerOAuthProvider('github')).toBe('github')
    expect(assertBrokerOAuthProvider('linkedin')).toBe('linkedin')
    expect(assertBrokerOAuthProvider('microsoft')).toBe('microsoft')
    expect(assertBrokerOAuthProvider('google')).toBe('google')
  })

  it('requires the server secret before enabling Google broker capability', () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '')
    overrideDynamicConfigFieldsForTest(oauthAuthorizationBrokerConfig, {
      google_native_enabled: true,
    })
    expect(isOAuthAuthorizationBrokerEnabled('google', 'native', ['google'])).toBe(false)
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-server-secret')
    expect(isOAuthAuthorizationBrokerEnabled('google', 'native', ['google'])).toBe(true)
  })
})
