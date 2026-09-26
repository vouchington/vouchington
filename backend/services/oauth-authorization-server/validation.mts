import { SCOPE_DEFINITIONS, validateScopeSet, type ApiScope } from '@modules/scopes'
import { OAuthProtocolError, invalidRequest, invalidTarget } from './errors.mts'
import { findOAuthProtectedResource, type OAuthProtectedResource } from './resources.mts'

const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/
const PKCE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/

// Accepts exactly one of the canonical protected-resource URLs that discovery publishes.
export function validateResource(value: unknown): OAuthProtectedResource {
  if (typeof value !== 'string' || value.length === 0) throw invalidRequest('resource is required')
  const resource = findOAuthProtectedResource(value)
  if (!resource) throw invalidTarget()
  return resource
}

// RFC 8707 makes `resource` optional at the token endpoint; when present it must name the resource
// the code or refresh family is already bound to.
export function assertTokenRequestResource(requested: string | undefined, bound: string): void {
  if (requested !== undefined && requested !== bound) throw invalidTarget()
}

export function assertScopesMatchResource(
  scopes: readonly ApiScope[],
  resource: OAuthProtectedResource,
): void {
  if (!scopes.every(scope => SCOPE_DEFINITIONS[scope].audience === resource.audience)) {
    throw new OAuthProtocolError('invalid_scope', 'scope does not match the requested resource')
  }
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
