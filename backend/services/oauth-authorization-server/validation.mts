import { validateScopeSet, type ApiScope } from '@modules/scopes'
import { getSiteOrigin } from '@modules/utils'
import { OAuthProtocolError, invalidRedirectUri, invalidRequest } from './errors.mts'

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1'])
const MAX_URI_LENGTH = 2048
const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

export function validateRedirectUris(values: unknown): string[] {
  if (!Array.isArray(values) || values.length === 0 || values.length > 10) {
    throw invalidRedirectUri('redirect_uris must contain between 1 and 10 entries')
  }
  const redirectUris = values.map(value => {
    if (typeof value !== 'string' || value.length > MAX_URI_LENGTH) {
      throw invalidRedirectUri('redirect_uris contains an invalid URI')
    }
    let uri: URL
    try {
      uri = new URL(value)
    } catch {
      throw invalidRedirectUri('redirect_uris contains an invalid URI')
    }
    if (value.includes('*') || uri.pathname.includes('*')) {
      throw invalidRedirectUri('redirect URIs cannot contain wildcards')
    }
    if (uri.username || uri.password || uri.hash) {
      throw invalidRedirectUri('redirect URIs cannot contain userinfo or fragments')
    }
    const loopback = isLoopbackHostname(uri.hostname)
    if (uri.protocol !== 'https:' && !(uri.protocol === 'http:' && loopback)) {
      throw invalidRedirectUri('redirect URIs must use HTTPS or loopback HTTP')
    }
    const serialized = uri.toString()
    if (serialized.length > MAX_URI_LENGTH) {
      throw invalidRedirectUri('redirect_uris contains an invalid URI')
    }
    return serialized
  })
  if (new Set(redirectUris).size !== redirectUris.length) {
    throw invalidRedirectUri('redirect_uris contains duplicates')
  }
  return redirectUris
}

export function validateResource(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_URI_LENGTH) {
    throw invalidRequest('resource is required')
  }
  let resource: URL
  try {
    resource = new URL(value)
  } catch {
    throw invalidRequest('resource must be an absolute URI')
  }
  const loopback = isLoopbackHostname(resource.hostname)
  if (resource.protocol !== 'https:' && !(resource.protocol === 'http:' && loopback)) {
    throw invalidRequest('resource must use HTTPS or loopback HTTP')
  }
  if (resource.username || resource.password || resource.hash || resource.search) {
    throw invalidRequest('resource cannot contain userinfo, query, or fragment components')
  }
  if (resource.pathname !== '/api/v1/mcp') {
    throw invalidRequest('resource is not supported')
  }
  const allowedOrigins = new Set([new URL(getSiteOrigin()).origin])
  if (process.env.NODE_ENV !== 'production') allowedOrigins.add('http://localhost:2900')
  if (!allowedOrigins.has(resource.origin)) {
    throw invalidRequest('resource is not supported')
  }
  return resource.toString()
}

export function parseOAuthScopes(value: unknown): ApiScope[] {
  if (typeof value !== 'string') throw new OAuthProtocolError('invalid_scope', 'scope is required')
  const values = value.split(' ').filter(Boolean)
  const result = validateScopeSet(values, { surface: 'oauth', allowMixedAudiences: true })
  if (!result.valid)
    throw new OAuthProtocolError('invalid_scope', `invalid scope set: ${result.code}`)
  return result.scopes
}

export function assertScopeSubset(scopes: ApiScope[], allowedScopes: ApiScope[]): void {
  if (!scopes.every(scope => allowedScopes.includes(scope))) {
    throw new OAuthProtocolError(
      'invalid_scope',
      'requested scope is not registered for this client',
    )
  }
}

export function validatePkceChallenge(challenge: unknown, method: unknown): string {
  if (method !== 'S256') throw invalidRequest('code_challenge_method must be S256')
  if (typeof challenge !== 'string' || !PKCE_CHALLENGE_PATTERN.test(challenge)) {
    throw invalidRequest('code_challenge is invalid')
  }
  return challenge
}

export function validatePkceVerifier(verifier: unknown): string {
  if (typeof verifier !== 'string' || !PKCE_VERIFIER_PATTERN.test(verifier)) {
    throw new OAuthProtocolError('invalid_grant', 'code_verifier is invalid')
  }
  return verifier
}

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname) || hostname === '[::1]'
}
