import { describe, expect, it } from 'vitest'
import { expectCachePolicyBypassesBeforeAnonymousOrBotCaching } from '../../test-helpers/src/cache-policy-route-bypass.mts'
import { isSessionEntryRoute } from '../cache-route-policy.mts'

describe('isSessionEntryRoute', () => {
  it('matches the login page with or without trailing slash', () => {
    expect(isSessionEntryRoute('/login')).toBe(true)
    expect(isSessionEntryRoute('/login/')).toBe(true)
    expect(isSessionEntryRoute('/session-renewal')).toBe(true)
    expect(isSessionEntryRoute('/session-renewal/')).toBe(true)
  })

  it('does not match login-adjacent routes', () => {
    expect(isSessionEntryRoute('/login/help')).toBe(false)
    expect(isSessionEntryRoute('/auth/login')).toBe(false)
  })
})

describe('login cache policy', () => {
  it('bypasses cache for the login page before anonymous or bot caching', () => {
    expectCachePolicyBypassesBeforeAnonymousOrBotCaching(['/login', '/login/'])
  })
})
