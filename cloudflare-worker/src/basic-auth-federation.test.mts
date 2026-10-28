import { describe, expect, it } from 'vitest'
import { getBasicAuthResponse } from './basic-auth.mts'

const BASIC_AUTH_CREDENTIALS = 'alice:secret'

function isExempt(method: string, pathname: string): boolean {
  const url = new URL(pathname, 'https://staging.voucha.ai')
  const request = new Request(url, { method })
  return getBasicAuthResponse(request, { BASIC_AUTH_CREDENTIALS }, url) === null
}

describe('public federation staging Basic Auth exemptions', () => {
  it('exempts exact public machine routes for their supported methods', () => {
    expect(isExempt('GET', '/.well-known/webfinger')).toBe(true)
    expect(isExempt('GET', '/.well-known/nodeinfo')).toBe(true)
    expect(isExempt('GET', '/nodeinfo/2.0')).toBe(true)
    expect(isExempt('POST', '/ap/inbox')).toBe(true)
    expect(isExempt('GET', '/client-metadata.json')).toBe(true)
  })

  it('exempts exactly one ActivityPub actor UUID segment', () => {
    expect(isExempt('GET', '/ap/users/23b0a75f-b618-4477-8e7d-87e44967727a')).toBe(true)
    expect(isExempt('get', '/AP/USERS/23B0A75F-B618-4477-8E7D-87E44967727A/')).toBe(true)
  })

  it('does not exempt empty, nested, or neighboring ActivityPub actor paths', () => {
    expect(isExempt('GET', '/ap/users')).toBe(false)
    expect(isExempt('GET', '/ap/users/')).toBe(false)
    expect(isExempt('GET', '/ap/users/alice/inbox')).toBe(false)
    expect(isExempt('GET', '/ap/users/not-a-uuid')).toBe(false)
    expect(isExempt('GET', '/ap/users-alice')).toBe(false)
    expect(isExempt('GET', '/ap/user/alice')).toBe(false)
  })

  it('does not exempt wrong-method federation machine routes', () => {
    expect(isExempt('POST', '/.well-known/webfinger')).toBe(false)
    expect(isExempt('HEAD', '/.well-known/nodeinfo')).toBe(false)
    expect(isExempt('POST', '/nodeinfo/2.0')).toBe(false)
    expect(isExempt('GET', '/ap/inbox')).toBe(false)
    expect(isExempt('POST', '/ap/users/alice')).toBe(false)
    expect(isExempt('POST', '/client-metadata.json')).toBe(false)
  })

  it('does not exempt neighboring federation machine routes', () => {
    expect(isExempt('GET', '/.well-known/webfinger.json')).toBe(false)
    expect(isExempt('GET', '/.well-known/nodeinfo/2.0')).toBe(false)
    expect(isExempt('GET', '/nodeinfo/2.1')).toBe(false)
    expect(isExempt('POST', '/ap/inbox/remote')).toBe(false)
    expect(isExempt('GET', '/client-metadata.json.bak')).toBe(false)
  })
})
