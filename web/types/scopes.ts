export type ScopeAudience = 'admin' | 'api' | 'user'
export type ScopeCredentialSurface = 'api-key' | 'oauth'
export type ScopeAction = 'read' | 'write'
export type ScopeDescriptionKey = 'mcp_admin_full_access' | 'mcp_user_full_access'

/** One entry of the public scope catalogue; `requires` names the scope this one implies. */
export interface ScopeCatalogEntry {
  scope: string
  resource: string
  action: ScopeAction
  audience: ScopeAudience
  description_key: ScopeDescriptionKey | null
  requires: string | null
  surfaces: ScopeCredentialSurface[]
}

export interface ScopeCatalogResponse {
  scopes: ScopeCatalogEntry[]
}
