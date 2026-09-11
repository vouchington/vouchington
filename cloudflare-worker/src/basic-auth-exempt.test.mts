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
    for (const provider of ['facebook', 'x', 'github']) {
      expect(isBasicAuthExemptRequest('GET', `/auth/callback/${provider}/broker`)).toBe(true)
    }
    expect(isBasicAuthExemptRequest('POST', '/auth/callback/facebook/broker')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/auth/callback/google/broker')).toBe(false)
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

  it('does not exempt wrong-method machine routes', () => {
    expect(isBasicAuthExemptRequest('GET', '/api/v1/mcp')).toBe(false)
    expect(isBasicAuthExemptRequest('GET', '/api/v1/admin/mcp')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/infra/ping')).toBe(false)
    expect(isBasicAuthExemptRequest('POST', '/manifest.webmanifest')).toBe(false)
  })

  it('keeps exempt paths synchronized and lowercase', () => {
    const { BASIC_AUTH_EXEMPT_METHODS_BY_PATH, BASIC_AUTH_EXEMPT_PATHS } = basicAuthTestExports

    expect(BASIC_AUTH_EXEMPT_PATHS.size).toBe(BASIC_AUTH_EXEMPT_METHODS_BY_PATH.size)

    for (const path of BASIC_AUTH_EXEMPT_PATHS) {
      expect(path).toBe(path.toLowerCase())
      expect(BASIC_AUTH_EXEMPT_METHODS_BY_PATH.has(path)).toBe(true)
    }

    for (const path of BASIC_AUTH_EXEMPT_METHODS_BY_PATH.keys()) {
      expect(path).toBe(path.toLowerCase())
      expect(BASIC_AUTH_EXEMPT_PATHS.has(path)).toBe(true)
    }
  })
})
