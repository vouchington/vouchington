export type ScopeAudience = 'admin' | 'api' | 'user'
export type ScopeCredentialSurface = 'api-key' | 'oauth'
export type ScopeAction = 'read' | 'write'

type ScopeDefinition = {
  action: ScopeAction
  audience: ScopeAudience
  resource: string
  surfaces: readonly ScopeCredentialSurface[]
  requires?: string
}

export const SCOPE_DEFINITIONS = {
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
} as const satisfies Record<string, ScopeDefinition>

export type ApiScope = keyof typeof SCOPE_DEFINITIONS

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
  return scopes.includes(requiredScope)
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
