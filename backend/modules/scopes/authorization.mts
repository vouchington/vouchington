import {
  hasScope,
  SCOPE_DEFINITIONS,
  type ApiScope,
  type ScopeAudience,
  type ScopeCredentialSurface,
} from './scopes.mts'

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

export function listScopesForAudience(
  audience: ScopeAudience,
  surface: ScopeCredentialSurface,
): ApiScope[] {
  return (Object.keys(SCOPE_DEFINITIONS) as ApiScope[])
    .filter(scope => {
      const definition = SCOPE_DEFINITIONS[scope]
      return definition.audience === audience && definition.surfaces.includes(surface)
    })
    .sort()
}

// Adds each scope's prerequisite (for example `cards:read` for `cards:write`), so the sorted
// result passes `validateScopeSet`.
export function withScopePrerequisites(scopes: readonly ApiScope[]): ApiScope[] {
  const result = new Set<ApiScope>()
  for (const scope of scopes) {
    result.add(scope)
    const requiredScope = SCOPE_DEFINITIONS[scope].requires
    if (requiredScope) result.add(requiredScope as ApiScope)
  }
  return [...result].sort()
}
