export type ScopeAudience = 'admin' | 'api' | 'brand' | 'community_moderation' | 'legal' | 'user'
export type McpScopeAudience = Exclude<ScopeAudience, 'api'>
export type ScopeCredentialSurface = 'api-key' | 'oauth'
export type ScopeAction = 'read' | 'write'
export type ScopeDescriptionKey =
  | 'mcp_admin_full_access'
  | 'mcp_user_full_access'
  | 'financial_profile_read'
  | 'financial_profile_write'
  | 'spending_read'
  | 'spending_write'
  | 'community_moderation_read'
  | 'community_moderation_write'
  | 'messages_read'
  | 'messages_write'
  | 'topic_claims_read'
  | 'topic_claims_write'
  | 'households_read'
  | 'households_write'

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
  audiences: ScopeAudiencePolicy[]
}

export interface ScopeAudiencePolicy {
  audience: McpScopeAudience
  accepts_api_keys: boolean
  requires_administrator: boolean
}
