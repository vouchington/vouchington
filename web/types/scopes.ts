export type ScopeAudience = 'admin' | 'api' | 'user'
export type ScopeCredentialSurface = 'api-key' | 'oauth'
export type ScopeAction = 'read' | 'write'

/** One entry of the public scope catalogue; `requires` names the scope this one implies. */
export interface ScopeCatalogEntry {
  scope: string
  resource: string
  action: ScopeAction
  audience: ScopeAudience
  requires: string | null
  surfaces: ScopeCredentialSurface[]
}

export interface ScopeCatalogResponse {
  scopes: ScopeCatalogEntry[]
}
