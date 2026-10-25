import { OAuthProtocolError } from '@vouchington/oauth-server'
import type { OAuthClient } from './types.mts'
import { write, type QueryExecutor } from '@data-stores/psql'
import { findOAuthProtectedResource, OAUTH_AUDIENCE_REQUIRES_ADMINISTRATOR } from './resources.mts'

// Only administrators may grant a client access to the staff MCP resources. Their routes
// still checks the role on every call; this keeps a non-admin from approving an unusable grant.
export async function mayUserAuthorizeOAuthResource(
  userId: string,
  resource: string,
  query: QueryExecutor = write,
): Promise<boolean> {
  const audience = findOAuthProtectedResource(resource)?.audience
  if (!audience) return false
  if (!OAUTH_AUDIENCE_REQUIRES_ADMINISTRATOR[audience]) return true
  const result = await query<{ is_administrator: boolean }>(
    `/* mayUserAuthorizeOAuthResource */ SELECT EXISTS (
       SELECT 1
       FROM user_roles
       JOIN user_role_types ON user_role_types.id = user_roles.role_type_id
       WHERE user_roles.user_id = $1::uuid
         AND user_role_types.slug = 'administrator'
     ) AS is_administrator`,
    [userId],
  )
  return result.rows.at(0)?.is_administrator ?? false
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
