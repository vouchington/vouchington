import { describe, expect, it } from 'vitest'
import { expectCachePolicyBypassesBeforeAnonymousOrBotCaching } from '../../test-helpers/src/cache-policy-route-bypass.mts'
import { isLoginRoute } from '../cache-route-policy.mts'

describe('isLoginRoute', () => {
  it('matches the login page with or without trailing slash', () => {
    expect(isLoginRoute('/login')).toBe(true)
    expect(isLoginRoute('/login/')).toBe(true)
  })

  it('does not match login-adjacent routes', () => {
    expect(isLoginRoute('/login/help')).toBe(false)
    expect(isLoginRoute('/auth/login')).toBe(false)
  })
})

describe('login cache policy', () => {
  it('bypasses cache for the login page before anonymous or bot caching', () => {
    expectCachePolicyBypassesBeforeAnonymousOrBotCaching(['/login', '/login/'])
  })
})
