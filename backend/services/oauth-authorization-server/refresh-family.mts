import type { TransactionQuery } from '@data-stores/psql'

export async function revokeOAuthRefreshFamily(
  familyId: string,
  query: TransactionQuery,
  reuseDetected: boolean,
): Promise<void> {
  const result = await query<{
    client_id: string
    grant_id: string
    resource: string
    scopes: string[]
    user_id: string
  }>(
    `/* revokeOAuthRefreshFamily */ UPDATE oauth_refresh_token_families
     SET revoked_at = COALESCE(oauth_refresh_token_families.revoked_at, CURRENT_TIMESTAMP),
         reuse_detected_at = CASE
           WHEN $2::boolean THEN COALESCE(
             oauth_refresh_token_families.reuse_detected_at,
             CURRENT_TIMESTAMP
           )
           ELSE oauth_refresh_token_families.reuse_detected_at
         END
     FROM oauth_grants AS oauth_grant
     WHERE oauth_refresh_token_families.id = $1
       AND oauth_grant.id = oauth_refresh_token_families.grant_id
     RETURNING
       oauth_grant.client_id,
       oauth_grant.id AS grant_id,
       oauth_refresh_token_families.resource,
       oauth_refresh_token_families.scopes,
       oauth_grant.user_id`,
    [familyId, reuseDetected],
  )
  const family = result.rows[0]
  if (!family) return
  await query(
    `/* revokeOAuthRefreshFamily refresh */ UPDATE oauth_refresh_tokens
     SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE family_id = $1`,
    [familyId],
  )
  await query(
    `/* revokeOAuthRefreshFamily access */ UPDATE oauth_access_tokens
     SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE refresh_family_id = $1`,
    [familyId],
  )
  await query(
    `/* revokeOAuthRefreshFamily event */ INSERT INTO oauth_authorization_server_events (
       event_type,
       refresh_token_family_id,
       user_id,
       client_id,
       grant_id,
       resource,
       scopes
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::text[])
     ON CONFLICT (refresh_token_family_id, event_type)
       WHERE refresh_token_family_id IS NOT NULL
     DO NOTHING`,
    [
      reuseDetected ? 'refresh_reuse_detected' : 'refresh_family_revoked',
      familyId,
      family.user_id,
      family.client_id,
      family.grant_id,
      family.resource,
      family.scopes,
    ],
  )
}
