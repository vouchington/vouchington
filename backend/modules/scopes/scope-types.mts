export type ScopeAudience = 'admin' | 'api' | 'user'
export type ScopeCredentialSurface = 'api-key' | 'oauth'
export type ScopeAction = 'read' | 'write'
export type ScopeDescriptionKey = 'mcp_admin_full_access' | 'mcp_user_full_access'

export type ApiScope =
  | 'cards:read'
  | 'cards:write'
  | 'communities:read'
  | 'data-points:read'
  | 'domain-ratings:read'
  | 'entity-relations:read'
  | 'entity-relations:write'
  | 'financial-profile:read'
  | 'financial-profile:write'
  | 'mcp.admin:read'
  | 'mcp.admin:write'
  | 'mcp.user:read'
  | 'mcp.user:write'
  | 'point-valuations:read'
  | 'point-valuations:write'
  | 'post-relations.owned-private:write'
  | 'posts:read'
  | 'profile:read'
  | 'recommendations:read'
  | 'referral-links:read'
  | 'rewards-statuses:read'
  | 'rewards-statuses:write'
  | 'rss:read'
  | 'spending:read'
  | 'spending:write'
  | 'topics:read'

export type ScopeDefinition = {
  action: ScopeAction
  audience: ScopeAudience
  descriptionKey?: ScopeDescriptionKey
  resource: string
  surfaces: readonly ScopeCredentialSurface[]
  requires?: string
  requiresExactGrant?: boolean
}
