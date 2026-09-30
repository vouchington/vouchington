import { describe, expect, it } from 'vitest'
import { expectCachePolicyBypassesBeforeAnonymousOrBotCaching } from '../../test-helpers/src/cache-policy-route-bypass.mts'
import { isAuthCallbackRoute } from '../cache-route-policy.mts'

describe('isAuthCallbackRoute', () => {
  it('matches the bare callback path and any provider subpath', () => {
    expect(isAuthCallbackRoute('/auth/callback')).toBe(true)
    expect(isAuthCallbackRoute('/auth/callback/github')).toBe(true)
    expect(isAuthCallbackRoute('/auth/callback/github/broker')).toBe(true)
    expect(isAuthCallbackRoute('/auth/callback/google')).toBe(true)
  })

  it('does not match auth-callback-adjacent routes', () => {
    expect(isAuthCallbackRoute('/auth/callback-help')).toBe(false)
    expect(isAuthCallbackRoute('/auth')).toBe(false)
    expect(isAuthCallbackRoute('/auth/login')).toBe(false)
  })
})

describe('auth callback cache policy', () => {
  it('bypasses cache for auth callback pages before anonymous or bot caching', () => {
    expectCachePolicyBypassesBeforeAnonymousOrBotCaching([
      '/auth/callback',
      '/auth/callback/github',
      '/auth/callback/github/broker',
    ])
  })
})
