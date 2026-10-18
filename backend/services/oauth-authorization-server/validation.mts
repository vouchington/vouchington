import { getVouchaScopeCatalog, isApiScope, type ApiScope } from '@modules/scopes'
import {
  OAuthProtocolError,
  parseScopeParameter,
  type ScopePolicy,
} from '@vouchington/oauth-server'

export const OAUTH_SCOPE_POLICY: ScopePolicy = {
  catalog: getVouchaScopeCatalog(),
  surface: 'oauth',
}

export function parseOAuthScopes(value: unknown): ApiScope[] {
  const { scopes } = parseScopeParameter(value, OAUTH_SCOPE_POLICY)
  if (!scopes.every(isApiScope)) throw new OAuthProtocolError('invalid_scope', 'unknown scope')
  return scopes
}

export function assertScopeSubset(scopes: ApiScope[], allowedScopes: ApiScope[]): void {
  if (!scopes.every(scope => allowedScopes.includes(scope))) {
    throw new OAuthProtocolError(
      'invalid_scope',
      'requested scope is not registered for this client',
    )
  }
}
