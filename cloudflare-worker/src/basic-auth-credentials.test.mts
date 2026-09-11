import { describe, expect, it } from 'vitest'

import {
  basicAuthorizationMatches,
  readBasicAuthCredentialList,
  requiredBasicAuthDecision,
} from './basic-auth-credentials.mts'

function basic(value: string): string {
  return `Basic ${btoa(value)}`
}

describe('shared Basic Auth credentials', () => {
  it('distinguishes absent, malformed, and valid credential configuration', () => {
    expect(readBasicAuthCredentialList(undefined)).toEqual({ status: 'absent' })
    expect(readBasicAuthCredentialList('   ')).toEqual({ status: 'absent' })
    expect(readBasicAuthCredentialList('alice:secret')).toEqual({
      status: 'configured',
      source: 'alice:secret',
      credentials: new Set(['alice:secret']),
      hasMalformedEntries: false,
    })
    expect(readBasicAuthCredentialList('alice')).toEqual({
      status: 'configured',
      source: 'alice',
      credentials: new Set(),
      hasMalformedEntries: true,
    })
  })

  it('rejects the entire required credential list when any entry is malformed', () => {
    expect(requiredBasicAuthDecision(basic('alice:secret'), 'alice:secret,bad')).toBe(
      'misconfigured',
    )
    expect(requiredBasicAuthDecision(basic('alice:secret'), 'alice:secret,')).toBe('misconfigured')
  })

  it('accepts multiple credentials and passwords containing colons', () => {
    const configured = 'alice:one,bob:two:with:colons'

    expect(requiredBasicAuthDecision(basic('alice:one'), configured)).toBe('authorized')
    expect(requiredBasicAuthDecision(basic('bob:two:with:colons'), configured)).toBe('authorized')
  })

  it('preserves significant leading and trailing credential whitespace', () => {
    const configured = ' alice:secret '

    expect(requiredBasicAuthDecision(basic(configured), configured)).toBe('authorized')
    expect(requiredBasicAuthDecision(basic('alice:secret'), configured)).toBe('unauthorized')
    expect(requiredBasicAuthDecision(basic(configured), `${configured},`)).toBe('misconfigured')
  })

  it('decodes and compares a valid Basic Authorization header', () => {
    expect(basicAuthorizationMatches(basic('alice:secret'), new Set(['alice:secret']))).toBe(true)
    expect(basicAuthorizationMatches(basic('alice:wrong'), new Set(['alice:secret']))).toBe(false)
  })

  it('rejects missing, malformed, and non-Basic Authorization headers', () => {
    const credentials = new Set(['alice:secret'])

    expect(basicAuthorizationMatches(null, credentials)).toBe(false)
    expect(basicAuthorizationMatches('Bearer token', credentials)).toBe(false)
    expect(basicAuthorizationMatches('Basic !!!', credentials)).toBe(false)
    expect(requiredBasicAuthDecision(null, 'alice:secret')).toBe('unauthorized')
  })
})
