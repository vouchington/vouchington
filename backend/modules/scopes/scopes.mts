export type ScopeAudience = 'admin' | 'api' | 'user'
export type ScopeCredentialSurface = 'api-key' | 'oauth'
export type ScopeAction = 'read' | 'write'

export type ApiScope =
  | 'cards:read'
  | 'cards:write'
  | 'data-points:read'
  | 'domain-ratings:read'
  | 'financial-profile:read'
  | 'financial-profile:write'
  | 'mcp.admin:read'
  | 'mcp.admin:write'
  | 'mcp.user:read'
  | 'mcp.user:write'
  | 'point-valuations:read'
  | 'point-valuations:write'
  | 'posts:read'
  | 'profile:read'
  | 'recommendations:read'
  | 'referral-links:read'
  | 'rewards-statuses:read'
  | 'rewards-statuses:write'
  | 'rss:read'
  | 'spending:read'
  | 'spending:write'
  | 'support-messages:read'
  | 'topics:read'
  | 'wikipedia:read'

type ScopeDefinition = {
  action: ScopeAction
  audience: ScopeAudience
  resource: string
  surfaces: readonly ScopeCredentialSurface[]
  requires?: string
}
const USER_RESOURCE_SCOPES = {
  cards: ['read', 'write'],
  'data-points': ['read'],
  'domain-ratings': ['read'],
  'financial-profile': ['read', 'write'],
  'point-valuations': ['read', 'write'],
  posts: ['read'],
  profile: ['read'],
  recommendations: ['read'],
  'referral-links': ['read'],
  'rewards-statuses': ['read', 'write'],
  spending: ['read', 'write'],
  topics: ['read'],
  wikipedia: ['read'],
} as const
function userResourceDefinitions(): Record<string, ScopeDefinition> {
  return Object.fromEntries(
    Object.entries(USER_RESOURCE_SCOPES).flatMap(([resource, actions]) =>
      actions.map(action => [
        `${resource}:${action}`,
        {
          action: action as ScopeAction,
          audience: 'user',
          ...(action === 'write' ? { requires: `${resource}:read` } : {}),
          resource,
          surfaces: ['api-key', 'oauth'],
        },
      ]),
    ),
  )
}
export const SCOPE_DEFINITIONS: Record<ApiScope, ScopeDefinition> = {
  'mcp.admin:read': {
    action: 'read',
    audience: 'admin',
    resource: 'mcp.admin',
    surfaces: ['api-key', 'oauth'],
  },
  'mcp.admin:write': {
    action: 'write',
    audience: 'admin',
    requires: 'mcp.admin:read',
    resource: 'mcp.admin',
    surfaces: ['api-key', 'oauth'],
  },
  'mcp.user:read': {
    action: 'read',
    audience: 'user',
    resource: 'mcp.user',
    surfaces: ['api-key', 'oauth'],
  },
  'mcp.user:write': {
    action: 'write',
    audience: 'user',
    requires: 'mcp.user:read',
    resource: 'mcp.user',
    surfaces: ['api-key', 'oauth'],
  },
  'rss:read': {
    action: 'read',
    audience: 'api',
    resource: 'rss',
    surfaces: ['api-key', 'oauth'],
  },
  'support-messages:read': {
    action: 'read',
    audience: 'admin',
    resource: 'support-messages',
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
      | 'support-messages:read'
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
