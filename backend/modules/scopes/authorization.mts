import { vouchaScopeGraph } from './scope-graph.mts'
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
  return vouchaScopeGraph(SCOPE_DEFINITIONS).listScopesForAudience(audience, surface) as ApiScope[]
}

// Adds each scope's prerequisite (for example `cards:read` for `cards:write`), so the sorted
// result passes `validateScopeSet`.
export function withScopePrerequisites(scopes: readonly ApiScope[]): ApiScope[] {
  return vouchaScopeGraph(SCOPE_DEFINITIONS).expandPrerequisites(scopes) as ApiScope[]
}
