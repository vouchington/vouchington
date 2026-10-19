import { describe, expect, it } from 'vitest'
import { basicAuthTestExports, isBasicAuthExemptRequest } from './basic-auth.mts'

describe('isBasicAuthExemptRequest', () => {
  it('exempts liveness ping for GET and HEAD', () => {
    expect(isBasicAuthExemptRequest('GET', '/infra/ping')).toBe(true)
    expect(isBasicAuthExemptRequest('HEAD', '/infra/ping')).toBe(true)
  })

  it('exempts the web app manifest for GET and HEAD', () => {
    expect(isBasicAuthExemptRequest('GET', '/manifest.webmanifest')).toBe(true)
    expect(isBasicAuthExemptRequest('HEAD', '/manifest.webmanifest')).toBe(true)
  })

  it('is case-insensitive for methods and paths', () => {
    expect(isBasicAuthExemptRequest('head', '/INFRA/PING')).toBe(true)
  })

  it('normalizes trailing slashes', () => {
    expect(isBasicAuthExemptRequest('GET', '/infra/ping/')).toBe(true)
    expect(isBasicAuthExemptRequest('POST', '/api/v1/mcp/')).toBe(true)
  })

  it('does not exempt arbitrary API paths', () => {
    expect(isBasicAuthExemptRequest('GET', '/api/v1/users')).toBe(false)
  })

  it('exempts only GET requests to supported OAuth broker callbacks', () => {
    for (const provider of ['facebook', 'x', 'github', 'google', 'linkedin', 'microsoft']) {
      expect(isBasicAuthExemptRequest('GET', `/auth/callback/${provider}/broker`)).toBe(true)
      expect(isBasicAuthExemptRequest('GET', `/auth/callback/${provider}/broker/`)).toBe(true)
      expect(isBasicAuthExemptRequest('POST', `/auth/callback/${provider}/broker`)).toBe(false)
      expect(isBasicAuthExemptRequest('HEAD', `/auth/callback/${provider}/broker`)).toBe(false)
    }
    expect(isBasicAuthExemptRequest('GET', '/auth/callback/google/brokered')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/auth/callback/google/broker/extra')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/auth/callback/linkedin/brokered')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/auth/callback/linkedin/broker/extra')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/auth/callback/microsoft/broker')).toBe(false)
    expect(isBasicAuthExemptRequest('HEAD', '/auth/callback/microsoft/broker')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/auth/callback/microsoft/brokered')).toBe(false)
  })

  it('does not exempt the root', () => {
    expect(isBasicAuthExemptRequest('GET', '/')).toBe(false)
  })

  it('does not exempt webhook prefix (exact match required)', () => {
    expect(isBasicAuthExemptRequest('POST', '/api/v1/webhooks')).toBe(false)
  })

  it('exempts POST MCP Bearer-auth endpoint', () => {
    expect(isBasicAuthExemptRequest('POST', '/api/v1/mcp')).toBe(true)
  })

  it('exempts POST admin MCP Bearer-auth endpoint', () => {
    expect(isBasicAuthExemptRequest('POST', '/api/v1/admin/mcp')).toBe(true)
  })

  it('exempts only POST requests to machine-facing OAuth endpoints', () => {
    for (const path of ['/register', '/revoke', '/token']) {
      expect(isBasicAuthExemptRequest('POST', path)).toBe(true)
      expect(isBasicAuthExemptRequest('GET', path)).toBe(false)
    }
    expect(isBasicAuthExemptRequest('GET', '/authorize')).toBe(false)
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
      expect(isBasicAuthExemptRequest('GET', path)).toBe(true)
      expect(isBasicAuthExemptRequest('POST', path)).toBe(false)
    }
    expect(isBasicAuthExemptRequest('GET', '/.well-known/oauth-protected-resource')).toBe(false)
  })

  it('does not exempt wrong-method machine routes', () => {
    expect(isBasicAuthExemptRequest('GET', '/api/v1/mcp')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/api/v1/admin/mcp')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/infra/ping')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/manifest.webmanifest')).toBe(false)
  })

  it('keeps exempt paths lowercase and without a trailing slash', () => {
    const { BASIC_AUTH_EXEMPT_METHODS_BY_PATH } = basicAuthTestExports

    // Lookups strip one trailing slash, so a key ending in '/' would never match.
    for (const path of BASIC_AUTH_EXEMPT_METHODS_BY_PATH.keys()) {
      expect(path).toBe(path.toLowerCase())
      expect(path.length > 1 && path.endsWith('/')).toBe(false)
    }
  })
  it.each(['/api/v1/brand/mcp', '/api/v1/community-moderation/mcp', '/api/v1/legal/mcp'])(
    'allows only POST MCP transport at %s',
    path => {
      expect(isBasicAuthExemptRequest('POST', path)).toBe(true)
      expect(isBasicAuthExemptRequest('GET', path)).toBe(false)
      expect(isBasicAuthExemptRequest('DELETE', path)).toBe(false)
      expect(isBasicAuthExemptRequest('POST', `${path}/other`)).toBe(false)
    },
  )
})
