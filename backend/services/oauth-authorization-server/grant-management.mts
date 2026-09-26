import { read, write } from '@data-stores/psql'
import type { OAuthGrantView, OAuthManagementPage } from './management-types.mts'

/**
 * Lists the apps a user has authorized. Bearer use only touches the access token, so
 * `last_used_at` is the later of the grant's own timestamp (consent, code and refresh exchange)
 * and its newest access-token use.
 */
export async function listUserOAuthGrants(
  currentUserId: string,
  options: { limit: number; afterId?: string },
): Promise<OAuthManagementPage<OAuthGrantView>> {
  const { rows } = await read<OAuthGrantView>(
    `/* listUserOAuthGrants */ SELECT
       oauth_grant.id,
       json_build_object(
         'id', client.id,
         'client_id', client.client_id,
         'client_name', client.client_name,
         'verified', client.verified_at IS NOT NULL
       ) AS client,
       oauth_grant.resource,
       oauth_grant.scopes,
       oauth_grant.consented_at,
       GREATEST(oauth_grant.last_used_at, token_use.last_used_at) AS last_used_at
     FROM oauth_grants AS oauth_grant
     JOIN oauth_clients AS client
       ON client.id = oauth_grant.client_id
      AND client.revoked_at IS NULL
     LEFT JOIN LATERAL (
       SELECT MAX(access.last_used_at) AS last_used_at
       FROM oauth_access_tokens AS access
       WHERE access.grant_id = oauth_grant.id
     ) AS token_use ON TRUE
     WHERE oauth_grant.user_id = $1
       AND oauth_grant.revoked_at IS NULL
       AND ($2::uuid IS NULL OR oauth_grant.id < $2::uuid)
     ORDER BY oauth_grant.id DESC
     LIMIT $3`,
    [currentUserId, options.afterId ?? null, options.limit + 1],
  )
  return { results: rows.slice(0, options.limit), hasNextPage: rows.length > options.limit }
}

/**
 * Revokes one of the user's grants. The bearer, refresh and code paths all require an unrevoked
 * grant, so its outstanding credentials stop working on their next use, and consenting again
 * creates a new grant.
 */
export async function revokeUserOAuthGrant(
  currentUserId: string,
  grantId: string,
): Promise<boolean> {
  const result = await write(
    `/* revokeUserOAuthGrant */ UPDATE oauth_grants
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND user_id = $2
       AND revoked_at IS NULL`,
    [grantId, currentUserId],
  )
  return result.rowCount === 1
}
