import {
  SCOPE_DEFINITIONS,
  validateScopeSet,
  type ApiScope,
  type ScopeAudience,
  type ScopeSetValidationResult,
} from '@modules/scopes'
import type { PrivateUser } from '../users/types.mts'
import type { ApiKeyType } from './format.mts'

type ApiKeyScopeSetValidationResult =
  | {
      valid: true
      permissions: ApiScope[]
      audience: ScopeAudience
    }
  | Extract<ScopeSetValidationResult, { valid: false }>
  | {
      valid: false
      code: 'scope-type-mismatch'
    }

export function validateApiKeyScopeSet(
  type: ApiKeyType,
  permissions: readonly string[],
): ApiKeyScopeSetValidationResult {
  const result = validateScopeSet(permissions, {
    surface: 'api-key',
    allowMixedAudiences: false,
  })
  if (!result.valid) return result

  const resources = result.scopes.map(scope => SCOPE_DEFINITIONS[scope].resource)
  const matchesType =
    type === 'rss'
      ? result.scopes.length === 1 && result.scopes[0] === 'rss:read'
      : resources.every(resource => resource === 'mcp.user' || resource === 'mcp.admin')
  if (!matchesType) return { valid: false, code: 'scope-type-mismatch' }

  const audience = result.audiences[0]
  if (!audience) return { valid: false, code: 'empty-scope-set' }
  return { valid: true, permissions: result.scopes, audience }
}

export function validateApiKeyCreationPermissions(
  currentUser: Pick<PrivateUser, 'roles'>,
  type: ApiKeyType,
  permissions: readonly string[],
): string | null {
  const result = validateApiKeyScopeSet(type, permissions)
  if (!result.valid) return apiKeyScopeValidationError(type, result)
  if (result.audience === 'admin' && !currentUser.roles.includes('administrator')) {
    return 'admin mcp scopes require administrator role'
  }
  return null
}

function apiKeyScopeValidationError(
  type: ApiKeyType,
  result: Exclude<ApiKeyScopeSetValidationResult, { valid: true }>,
): string {
  switch (result.code) {
    case 'duplicate-scope':
      return 'api key scopes must not contain duplicates'
    case 'empty-scope-set':
      return 'api key scopes must not be empty'
    case 'missing-prerequisite':
      return `${result.scope} requires ${result.requiredScope}`
    case 'mixed-audiences':
      return 'api key scopes must not mix audiences'
    case 'scope-type-mismatch':
      return type === 'rss'
        ? 'rss keys must use rss:read'
        : 'mcp keys must use only mcp.user or mcp.admin scopes'
    case 'unknown-scope':
      return `unknown or noncanonical scope: ${result.scope}`
    case 'unsupported-surface':
      return `scope is not supported for API keys: ${result.scope}`
  }
}
