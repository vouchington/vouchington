import { listScopesForAudience, type ApiScope } from '@modules/scopes'
import { getSiteOrigin } from '@modules/utils'

export type OAuthResourceAudience = 'admin' | 'user'

export type OAuthProtectedResource = {
  audience: OAuthResourceAudience
  url: string
}

export const OAUTH_PROTECTED_RESOURCE_PATHS = {
  admin: '/api/v1/admin/mcp',
  user: '/api/v1/mcp',
} as const satisfies Record<OAuthResourceAudience, string>

const OAUTH_RESOURCE_AUDIENCES = Object.keys(
  OAUTH_PROTECTED_RESOURCE_PATHS,
) as OAuthResourceAudience[]

// RFC 9728 inserts the well-known segment before the resource path, so each resource on this shared
// origin has its own metadata document.
const OAUTH_PROTECTED_RESOURCE_METADATA_PATH_PREFIX = '/.well-known/oauth-protected-resource'

// The issuer comes from configuration, never from the request Host, so every discovery document,
// token binding and RFC 9207 `iss` value agrees byte for byte.
export function getOAuthIssuer(): string {
  return new URL(getSiteOrigin()).origin
}

export function getOAuthResourceUrl(audience: OAuthResourceAudience): string {
  return `${getOAuthIssuer()}${OAUTH_PROTECTED_RESOURCE_PATHS[audience]}`
}

export function getOAuthResourceMetadataUrl(audience: OAuthResourceAudience): string {
  return `${getOAuthIssuer()}${OAUTH_PROTECTED_RESOURCE_METADATA_PATH_PREFIX}${OAUTH_PROTECTED_RESOURCE_PATHS[audience]}`
}

export function findOAuthProtectedResource(value: string): OAuthProtectedResource | null {
  const audience = OAUTH_RESOURCE_AUDIENCES.find(
    candidate => getOAuthResourceUrl(candidate) === value,
  )
  return audience ? { audience, url: value } : null
}

export function listOAuthResourceScopes(audience: OAuthResourceAudience): ApiScope[] {
  return listScopesForAudience(audience, 'oauth')
}

export function buildOAuthAuthorizationServerMetadata() {
  const issuer = getOAuthIssuer()
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    registration_endpoint: `${issuer}/register`,
    revocation_endpoint: `${issuer}/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
    revocation_endpoint_auth_methods_supported: ['client_secret_basic', 'none'],
    scopes_supported: OAUTH_RESOURCE_AUDIENCES.flatMap(listOAuthResourceScopes).sort(),
    authorization_response_iss_parameter_supported: true,
  }
}

export function buildOAuthProtectedResourceMetadata(audience: OAuthResourceAudience) {
  return {
    resource: getOAuthResourceUrl(audience),
    authorization_servers: [getOAuthIssuer()],
    bearer_methods_supported: ['header'],
    scopes_supported: listOAuthResourceScopes(audience),
  }
}
