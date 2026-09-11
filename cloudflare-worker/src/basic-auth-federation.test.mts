import { describe, expect, it } from 'vitest'
import { isBasicAuthExemptRequest } from './basic-auth.mts'

describe('public federation staging Basic Auth exemptions', () => {
  it('exempts exact public machine routes for their supported methods', () => {
    expect(isBasicAuthExemptRequest('GET', '/.well-known/webfinger')).toBe(true)
    expect(isBasicAuthExemptRequest('GET', '/.well-known/nodeinfo')).toBe(true)
    expect(isBasicAuthExemptRequest('GET', '/nodeinfo/2.0')).toBe(true)
    expect(isBasicAuthExemptRequest('POST', '/ap/inbox')).toBe(true)
    expect(isBasicAuthExemptRequest('GET', '/client-metadata.json')).toBe(true)
  })

  it('exempts exactly one ActivityPub actor UUID segment', () => {
    expect(isBasicAuthExemptRequest('GET', '/ap/users/23b0a75f-b618-4477-8e7d-87e44967727a')).toBe(
      true,
    )
    expect(isBasicAuthExemptRequest('get', '/AP/USERS/23B0A75F-B618-4477-8E7D-87E44967727A/')).toBe(
      true,
    )
  })

  it('does not exempt empty, nested, or neighboring ActivityPub actor paths', () => {
    expect(isBasicAuthExemptRequest('GET', '/ap/users')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/ap/users/')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/ap/users/alice/inbox')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/ap/users/not-a-uuid')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/ap/users-alice')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/ap/user/alice')).toBe(false)
  })

  it('does not exempt wrong-method federation machine routes', () => {
    expect(isBasicAuthExemptRequest('POST', '/.well-known/webfinger')).toBe(false)
    expect(isBasicAuthExemptRequest('HEAD', '/.well-known/nodeinfo')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/nodeinfo/2.0')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/ap/inbox')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/ap/users/alice')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/client-metadata.json')).toBe(false)
  })

  it('does not exempt neighboring federation machine routes', () => {
    expect(isBasicAuthExemptRequest('GET', '/.well-known/webfinger.json')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/.well-known/nodeinfo/2.0')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/nodeinfo/2.1')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/ap/inbox/remote')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/client-metadata.json.bak')).toBe(false)
  })
})
