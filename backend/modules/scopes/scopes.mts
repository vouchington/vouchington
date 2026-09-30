import { compileVouchaScopeCatalog } from './scope-graph.mts'
import { userResourceDefinitions } from './user-resource-definitions.mts'

import type {
  ApiScope,
  ScopeAudience,
  ScopeCredentialSurface,
  ScopeDefinition,
} from './scope-types.mts'
export type {
  ApiScope,
  ScopeAction,
  ScopeAudience,
  ScopeCredentialSurface,
  ScopeDefinition,
  ScopeDescriptionKey,
} from './scope-types.mts'

export const SCOPE_DEFINITIONS: Record<ApiScope, ScopeDefinition> = {
  'mcp.admin:read': {
    action: 'read',
    audience: 'admin',
    descriptionKey: 'mcp_admin_full_access',
    resource: 'mcp.admin',
    surfaces: ['oauth'],
  },
  'mcp.admin:write': {
    action: 'write',
    audience: 'admin',
    descriptionKey: 'mcp_admin_full_access',
    requires: 'mcp.admin:read',
    resource: 'mcp.admin',
    surfaces: ['oauth'],
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
  return compileVouchaScopeCatalog(SCOPE_DEFINITIONS).hasScope(scopes, requiredScope)
}

export function validateScopeSet(
  input: readonly string[],
  options: {
    surface: ScopeCredentialSurface
    allowMixedAudiences: boolean
  },
): ScopeSetValidationResult {
  const result = compileVouchaScopeCatalog(SCOPE_DEFINITIONS).validateScopeSet(input, options)
  if (!result.valid) {
    const requiredScope =
      result.requiredScope !== undefined && isApiScope(result.requiredScope)
        ? result.requiredScope
        : undefined
    return {
      valid: false,
      code: result.code,
      ...(result.scope === undefined ? {} : { scope: result.scope }),
      ...(requiredScope === undefined ? {} : { requiredScope }),
    }
  }
  return {
    valid: true,
    scopes: result.scopes as ApiScope[],
    audiences: result.audiences as ScopeAudience[],
  }
}
