import { describe, expect, it } from 'vitest'
import { getBasicAuthResponse } from './basic-auth.mts'

const BASIC_AUTH_CREDENTIALS = 'alice:secret'

function isExempt(method: string, pathname: string): boolean {
  const url = new URL(pathname, 'https://staging.voucha.ai')
  const request = new Request(url, { method })
  return getBasicAuthResponse(request, { BASIC_AUTH_CREDENTIALS }, url) === null
}

describe('staging Basic Auth exemptions', () => {
  it('exempts liveness ping for GET and HEAD', () => {
    expect(isExempt('GET', '/infra/ping')).toBe(true)
    expect(isExempt('HEAD', '/infra/ping')).toBe(true)
  })

  it('exempts the web app manifest for GET and HEAD', () => {
    expect(isExempt('GET', '/manifest.webmanifest')).toBe(true)
    expect(isExempt('HEAD', '/manifest.webmanifest')).toBe(true)
  })

  it('is case-insensitive for methods and paths', () => {
    expect(isExempt('head', '/INFRA/PING')).toBe(true)
  })

  it('normalizes trailing slashes', () => {
    expect(isExempt('GET', '/infra/ping/')).toBe(true)
    expect(isExempt('POST', '/api/v1/mcp/')).toBe(true)
  })

  it('does not exempt arbitrary API paths', () => {
    expect(isExempt('GET', '/api/v1/users')).toBe(false)
  })

  it('exempts only GET requests to supported OAuth broker callbacks', () => {
    for (const provider of ['facebook', 'x', 'github', 'google', 'linkedin', 'microsoft']) {
      expect(isExempt('GET', `/auth/callback/${provider}/broker`)).toBe(true)
      expect(isExempt('GET', `/auth/callback/${provider}/broker/`)).toBe(true)
      expect(isExempt('POST', `/auth/callback/${provider}/broker`)).toBe(false)
      expect(isExempt('HEAD', `/auth/callback/${provider}/broker`)).toBe(false)
    }
    expect(isExempt('GET', '/auth/callback/google/brokered')).toBe(false)
    expect(isExempt('GET', '/auth/callback/google/broker/extra')).toBe(false)
    expect(isExempt('GET', '/auth/callback/linkedin/brokered')).toBe(false)
    expect(isExempt('GET', '/auth/callback/linkedin/broker/extra')).toBe(false)
    expect(isExempt('POST', '/auth/callback/microsoft/broker')).toBe(false)
    expect(isExempt('HEAD', '/auth/callback/microsoft/broker')).toBe(false)
    expect(isExempt('GET', '/auth/callback/microsoft/brokered')).toBe(false)
  })

  it('does not exempt the root', () => {
    expect(isExempt('GET', '/')).toBe(false)
  })

  it('does not exempt webhook prefix (exact match required)', () => {
    expect(isExempt('POST', '/api/v1/webhooks')).toBe(false)
  })

  it('exempts POST MCP Bearer-auth endpoint', () => {
    expect(isExempt('POST', '/api/v1/mcp')).toBe(true)
  })

  it('exempts POST admin MCP Bearer-auth endpoint', () => {
    expect(isExempt('POST', '/api/v1/admin/mcp')).toBe(true)
  })

  it('exempts only POST requests to machine-facing OAuth endpoints', () => {
    for (const path of ['/register', '/revoke', '/token']) {
      expect(isExempt('POST', path)).toBe(true)
      expect(isExempt('GET', path)).toBe(false)
    }
    expect(isExempt('GET', '/authorize')).toBe(false)
  })

  it('exempts only GET requests to OAuth discovery documents', () => {
    for (const path of [
      '/.well-known/oauth-authorization-server',
      '/.well-known/oauth-protected-resource/api/v1/mcp',
      '/.well-known/oauth-protected-resource/api/v1/admin/mcp',
      '/.well-known/oauth-protected-resource/api/v1/community-moderation/mcp',
      '/.well-known/oauth-protected-resource/api/v1/brand/mcp',
      '/.well-known/oauth-protected-resource/api/v1/legal/mcp',
    ]) {
      expect(isExempt('GET', path)).toBe(true)
      expect(isExempt('POST', path)).toBe(false)
    }
    expect(isExempt('GET', '/.well-known/oauth-protected-resource')).toBe(false)
  })

  it('does not exempt wrong-method machine routes', () => {
    expect(isExempt('GET', '/api/v1/mcp')).toBe(false)
    expect(isExempt('GET', '/api/v1/admin/mcp')).toBe(false)
    expect(isExempt('POST', '/infra/ping')).toBe(false)
    expect(isExempt('POST', '/manifest.webmanifest')).toBe(false)
  })

  it.each(['/api/v1/brand/mcp', '/api/v1/community-moderation/mcp', '/api/v1/legal/mcp'])(
    'allows only POST MCP transport at %s',
    path => {
      expect(isExempt('POST', path)).toBe(true)
      expect(isExempt('GET', path)).toBe(false)
      expect(isExempt('DELETE', path)).toBe(false)
      expect(isExempt('POST', `${path}/other`)).toBe(false)
    },
  )
})
