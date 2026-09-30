import { validateScopeSet, type ApiScope, type ScopeSetValidationResult } from '@modules/scopes'
import type { ApiKeyType } from './format.mts'

type ApiKeyScopeSetValidationResult =
  | {
      valid: true
      permissions: ApiScope[]
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

  const matchesType =
    type === 'rss'
      ? result.scopes.length === 1 && result.scopes[0] === 'rss:read'
      : result.audiences.length === 1 && result.audiences[0] === 'user'
  if (!matchesType) return { valid: false, code: 'scope-type-mismatch' }
  return { valid: true, permissions: result.scopes }
}

export function validateApiKeyCreationPermissions(
  type: ApiKeyType,
  permissions: readonly string[],
): string | null {
  const result = validateApiKeyCreationScopeSet(type, permissions)
  return result.valid ? null : result.error
}

export function validateApiKeyCreationScopeSet(
  type: ApiKeyType,
  permissions: readonly string[],
): { valid: true; permissions: ApiScope[] } | { valid: false; error: string } {
  const result = validateApiKeyScopeSet(type, permissions)
  if (!result.valid) return { valid: false, error: apiKeyScopeValidationError(type, result) }
  return { valid: true, permissions: result.permissions }
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
        : 'mcp keys must use user-audience scopes'
    case 'unknown-scope':
      return `unknown or noncanonical scope: ${result.scope}`
    case 'unsupported-surface':
      return `scope is not supported for API keys: ${result.scope}`
  }
}
