import { listScopesForAudience, type ApiScope } from '@modules/scopes'
import {
  buildAuthorizationServerMetadata,
  buildProtectedResourceMetadata,
  protectedResourceMetadataUrl,
} from '@vouchington/oauth-server'
import { getSiteOrigin } from '@modules/utils'

export type OAuthResourceAudience = 'admin' | 'brand' | 'community_moderation' | 'legal' | 'user'

export const OAUTH_AUDIENCE_REQUIRES_ADMINISTRATOR: Readonly<
  Record<OAuthResourceAudience, boolean>
> = {
  user: false,
  community_moderation: false,
  brand: false,
  admin: true,
  legal: true,
}

export type OAuthProtectedResource = {
  audience: OAuthResourceAudience
  url: string
}

export const OAUTH_PROTECTED_RESOURCE_PATHS = {
  admin: '/api/v1/admin/mcp',
  brand: '/api/v1/brand/mcp',
  community_moderation: '/api/v1/community-moderation/mcp',
  legal: '/api/v1/legal/mcp',
  user: '/api/v1/mcp',
} as const satisfies Record<OAuthResourceAudience, string>

const OAUTH_RESOURCE_AUDIENCES = Object.keys(
  OAUTH_PROTECTED_RESOURCE_PATHS,
) as OAuthResourceAudience[]

// The issuer comes from configuration, never from the request Host, so every discovery document,
// token binding and RFC 9207 `iss` value agrees byte for byte.
export function getOAuthIssuer(): string {
  return new URL(getSiteOrigin()).origin
}

export function getOAuthResourceUrl(audience: OAuthResourceAudience): string {
  return `${getOAuthIssuer()}${OAUTH_PROTECTED_RESOURCE_PATHS[audience]}`
}

export function getOAuthResourceMetadataUrl(audience: OAuthResourceAudience): string {
  return protectedResourceMetadataUrl(getOAuthResourceUrl(audience))
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
  return buildAuthorizationServerMetadata({
    issuer,
    scopesSupported: OAUTH_RESOURCE_AUDIENCES.flatMap(listOAuthResourceScopes),
    extra: { client_id_metadata_document_supported: true },
  })
}

export function buildOAuthProtectedResourceMetadata(audience: OAuthResourceAudience) {
  return buildProtectedResourceMetadata({
    resource: getOAuthResourceUrl(audience),
    issuer: getOAuthIssuer(),
    scopesSupported: listOAuthResourceScopes(audience),
  })
}
