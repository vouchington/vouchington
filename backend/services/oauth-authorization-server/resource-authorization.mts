import { OAuthProtocolError } from '@vouchington/oauth-server'
import type { OAuthClient } from './types.mts'
import { write, type QueryExecutor } from '@data-stores/psql'
import {
  findOAuthProtectedResource,
  OAUTH_AUDIENCE_REQUIRES_ADMINISTRATOR,
  OAUTH_AUDIENCE_REQUIRES_MODERATION_STAFF,
} from './resources.mts'

// Administrators grant legal-resource access; moderators and administrators grant admin-resource
// access. MCP tools still check the current role and selected scope on every call.
export async function mayUserAuthorizeOAuthResource(
  userId: string,
  resource: string,
  query: QueryExecutor = write,
): Promise<boolean> {
  const audience = findOAuthProtectedResource(resource)?.audience
  if (!audience) return false
  let requiredRoles: string[] | null = null
  if (OAUTH_AUDIENCE_REQUIRES_ADMINISTRATOR[audience]) {
    requiredRoles = ['administrator']
  } else if (OAUTH_AUDIENCE_REQUIRES_MODERATION_STAFF[audience]) {
    requiredRoles = ['administrator', 'moderator']
  }
  if (requiredRoles === null) return true
  const result = await query<{ allowed: boolean }>(
    `/* mayUserAuthorizeOAuthResource */ SELECT EXISTS (
       SELECT 1
       FROM user_roles
       JOIN user_role_types ON user_role_types.id = user_roles.role_type_id
       WHERE user_roles.user_id = $1::uuid
         AND user_role_types.slug = ANY($2::text[])
     ) AS allowed`,
    [userId, requiredRoles],
  )
  return result.rows.at(0)?.allowed ?? false
}

export function assertOAuthClientMayAuthorizeResource(
  client: Pick<OAuthClient, 'metadata_url'>,
  resource: string,
): void {
  const audience = findOAuthProtectedResource(resource)?.audience
  if (!client.metadata_url && (audience === 'admin' || audience === 'legal')) {
    throw new OAuthProtocolError(
      'unauthorized_client',
      'client may not authorize this resource',
      403,
    )
  }
}
