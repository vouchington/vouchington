import { userResourceDefinitions } from './user-resource-definitions.mts'

export type ScopeAudience = 'admin' | 'api' | 'user'
export type ScopeCredentialSurface = 'api-key' | 'oauth'
export type ScopeAction = 'read' | 'write'
export type ScopeDescriptionKey = 'mcp_admin_full_access' | 'mcp_user_full_access'

export type ApiScope =
  | 'cards:read'
  | 'cards:write'
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
  | 'wikipedia:read'

export type ScopeDefinition = {
  action: ScopeAction
  audience: ScopeAudience
  descriptionKey?: ScopeDescriptionKey
  resource: string
  surfaces: readonly ScopeCredentialSurface[]
  requires?: string
  requiresExactGrant?: boolean
}
export const SCOPE_DEFINITIONS: Record<ApiScope, ScopeDefinition> = {
  'mcp.admin:read': {
    action: 'read',
    audience: 'admin',
    descriptionKey: 'mcp_admin_full_access',
    resource: 'mcp.admin',
    surfaces: ['api-key', 'oauth'],
  },
  'mcp.admin:write': {
    action: 'write',
    audience: 'admin',
    descriptionKey: 'mcp_admin_full_access',
    requires: 'mcp.admin:read',
    resource: 'mcp.admin',
    surfaces: ['api-key', 'oauth'],
  },
  'mcp.user:read': {
    action: 'read',
    audience: 'user',
    descriptionKey: 'mcp_user_full_access',
    resource: 'mcp.user',
    surfaces: ['api-key', 'oauth'],
  },
  'mcp.user:write': {
    action: 'write',
    audience: 'user',
    descriptionKey: 'mcp_user_full_access',
    requires: 'mcp.user:read',
    resource: 'mcp.user',
    surfaces: ['api-key', 'oauth'],
  },
  'rss:read': {
    action: 'read',
    audience: 'api',
    resource: 'rss',
    surfaces: ['api-key'],
  },
  'post-relations.owned-private:write': {
    action: 'write',
    audience: 'user',
    requires: 'entity-relations:write',
    requiresExactGrant: true,
    resource: 'post-relations.owned-private',
    surfaces: ['api-key', 'oauth'],
  },
  ...(userResourceDefinitions() as Record<
    Exclude<
      ApiScope,
      | 'mcp.admin:read'
      | 'mcp.admin:write'
      | 'mcp.user:read'
      | 'mcp.user:write'
      | 'rss:read'
      | 'post-relations.owned-private:write'
    >,
    ScopeDefinition
  >),
}
export type ScopeSetValidationErrorCode =
  | 'duplicate-scope'
  | 'empty-scope-set'
  | 'missing-prerequisite'
  | 'mixed-audiences'
  | 'unsupported-surface'
  | 'unknown-scope'
export type ScopeSetValidationResult =
  | {
      valid: true
      scopes: ApiScope[]
      audiences: ScopeAudience[]
    }
  | {
      valid: false
      code: ScopeSetValidationErrorCode
      scope?: string
      requiredScope?: ApiScope
    }

export function isApiScope(value: string): value is ApiScope {
  return Object.hasOwn(SCOPE_DEFINITIONS, value)
}

export function parseApiScope(value: string): ApiScope | null {
  return isApiScope(value) ? value : null
}

export function hasScope(scopes: readonly ApiScope[], requiredScope: ApiScope): boolean {
  if (scopes.includes(requiredScope)) return true

  const required = SCOPE_DEFINITIONS[requiredScope]
  if (required.requiresExactGrant) return false
  if (required.audience === 'user') {
    return scopes.includes(`mcp.user:${required.action}` as ApiScope)
  }
  if (required.audience === 'admin') {
    return scopes.includes(`mcp.admin:${required.action}` as ApiScope)
  }
  return false
}

export function validateScopeSet(
  input: readonly string[],
  options: {
    surface: ScopeCredentialSurface
    allowMixedAudiences: boolean
  },
): ScopeSetValidationResult {
  if (input.length === 0) return { valid: false, code: 'empty-scope-set' }

  const scopeSet = new Set<string>()
  for (const value of input) {
    if (!isApiScope(value)) return { valid: false, code: 'unknown-scope', scope: value }
    if (scopeSet.has(value)) return { valid: false, code: 'duplicate-scope', scope: value }
    if (!SCOPE_DEFINITIONS[value].surfaces.includes(options.surface)) {
      return { valid: false, code: 'unsupported-surface', scope: value }
    }
    scopeSet.add(value)
  }

  const scopes = [...scopeSet].sort() as ApiScope[]
  for (const scope of scopes) {
    const definition = SCOPE_DEFINITIONS[scope]
    const requiredScope = 'requires' in definition ? (definition.requires as ApiScope) : undefined
    if (requiredScope && !scopeSet.has(requiredScope)) {
      return { valid: false, code: 'missing-prerequisite', scope, requiredScope }
    }
  }

  const audiences = [
    ...new Set(scopes.map(scope => SCOPE_DEFINITIONS[scope].audience)),
  ].sort() as ScopeAudience[]
  if (!options.allowMixedAudiences && audiences.length > 1) {
    return { valid: false, code: 'mixed-audiences' }
  }

  return { valid: true, scopes, audiences }
}
