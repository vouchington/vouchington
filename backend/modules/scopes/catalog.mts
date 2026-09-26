import {
  SCOPE_DEFINITIONS,
  type ApiScope,
  type ScopeAction,
  type ScopeAudience,
  type ScopeCredentialSurface,
} from './scopes.mts'

/**
 * Wire shape of one catalogue entry. `scope` and `requires` stay plain strings so that adding a
 * scope is a data change for clients rather than a response-schema change.
 */
export type ScopeCatalogEntry = {
  scope: string
  resource: string
  action: ScopeAction
  audience: ScopeAudience
  requires: string | null
  surfaces: ScopeCredentialSurface[]
}

export function listScopeCatalog(): ScopeCatalogEntry[] {
  return (Object.keys(SCOPE_DEFINITIONS) as ApiScope[]).sort().map(scope => {
    const definition = SCOPE_DEFINITIONS[scope]
    return {
      scope,
      resource: definition.resource,
      action: definition.action,
      audience: definition.audience,
      requires: definition.requires ?? null,
      surfaces: [...definition.surfaces],
    }
  })
}
