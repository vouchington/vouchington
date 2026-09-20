import { hasScope, SCOPE_DEFINITIONS, type ApiScope, type ScopeAudience } from './scopes.mts'

export function hasEveryScope(
  scopes: readonly ApiScope[],
  requiredScopes: readonly ApiScope[],
): boolean {
  return requiredScopes.every(requiredScope => hasScope(scopes, requiredScope))
}

export function hasScopeAudience(
  scopes: readonly ApiScope[],
  audience: Exclude<ScopeAudience, 'api'>,
): boolean {
  return scopes.some(scope => SCOPE_DEFINITIONS[scope].audience === audience)
}
