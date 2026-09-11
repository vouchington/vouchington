import { describe, expect, it } from 'vitest'
import { isExternalServerToServerIngress } from './external-server-ingress.mts'

describe('external server-to-server ingress routing', () => {
  it('matches Apple App Store notifications only at their POST endpoint', () => {
    expect(
      isExternalServerToServerIngress('POST', '/api/v1/memberships/apple-app-store/notifications'),
    ).toBe(true)
    expect(
      isExternalServerToServerIngress('GET', '/api/v1/memberships/apple-app-store/notifications'),
    ).toBe(false)
    expect(isExternalServerToServerIngress('POST', '/api/v1/memberships/apple-app-store')).toBe(
      false,
    )
  })

  it('retains federation server-to-server ingress classification', () => {
    expect(isExternalServerToServerIngress('POST', '/ap/inbox')).toBe(true)
    expect(isExternalServerToServerIngress('GET', '/.well-known/webfinger')).toBe(true)
    expect(isExternalServerToServerIngress('POST', '/.well-known/webfinger')).toBe(false)
    expect(
      isExternalServerToServerIngress('GET', '/ap/users/01234567-89ab-cdef-0123-456789abcdef'),
    ).toBe(true)
  })
})
