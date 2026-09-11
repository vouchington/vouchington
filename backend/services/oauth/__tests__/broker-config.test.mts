import { afterEach, describe, expect, it } from 'vitest'
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
    expect(() => assertBrokerOAuthProvider('google')).toThrow(
      expect.objectContaining({ status: 404 }),
    )
  })
})
