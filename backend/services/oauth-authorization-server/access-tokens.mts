import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { OAUTH_ACCESS_TOKEN_PREFIX, OAUTH_SECRET_PURPOSES } from './constants.mts'
import { lockOAuthParticipantUsers } from './active-users.mts'
import { getOAuthResourceUrl, type OAuthResourceAudience } from './resources.mts'
import type { OAuthAccessPrincipal } from './types.mts'

export function isOAuthAccessToken(rawToken: string): boolean {
  return rawToken.startsWith(OAUTH_ACCESS_TOKEN_PREFIX)
}

// A token authenticates only to the canonical resource it was issued for.
export async function validateOAuthAccessToken(
  rawToken: string,
  audience: OAuthResourceAudience,
): Promise<OAuthAccessPrincipal | null> {
  await using query = await beginTransaction()
  const tokenHash = hashToken(OAUTH_SECRET_PURPOSES.accessToken, rawToken)
  const activeParticipantIds = await lockOAuthParticipantUsers(
    await readAccessTokenParticipants(tokenHash, query),
    query,
  )
  const result = await query<OAuthAccessPrincipal & { owner_user_id: string | null }>(
    `/* validateOAuthAccessToken */ UPDATE oauth_access_tokens AS access
     SET last_used_at = CURRENT_TIMESTAMP
     FROM oauth_grants AS oauth_grant, oauth_clients AS client
     WHERE access.grant_id = oauth_grant.id
       AND oauth_grant.client_id = client.id
       AND access.token_hash = $1
       AND access.revoked_at IS NULL
       AND access.expires_at > CURRENT_TIMESTAMP
       AND oauth_grant.revoked_at IS NULL
       AND client.revoked_at IS NULL
       AND EXISTS (
         SELECT 1 FROM users WHERE users.id = oauth_grant.user_id AND users.deleted_at IS NULL
       )
       AND (
         client.owner_user_id IS NULL OR EXISTS (
           SELECT 1 FROM users WHERE users.id = client.owner_user_id AND users.deleted_at IS NULL
         )
       )
       AND NOT EXISTS (
         SELECT 1
         FROM user_suspensions AS suspension
         WHERE suspension.user_id = oauth_grant.user_id
           AND suspension.lifted_at IS NULL
       )
       AND access.resource = $2
     RETURNING client.id AS oauth_client_id, client.client_id, client.owner_user_id,
       oauth_grant.id AS grant_id, oauth_grant.user_id, access.resource, access.scopes::text[] AS scopes, access.expires_at`,
    [tokenHash, getOAuthResourceUrl(audience)],
  )
  const principal = result.rows[0]
  if (
    !principal ||
    !activeParticipantIds.has(principal.user_id) ||
    (principal.owner_user_id && !activeParticipantIds.has(principal.owner_user_id))
  ) {
    await query.commit()
    return null
  }
  await query.commit()
  return {
    oauth_client_id: principal.oauth_client_id,
    client_id: principal.client_id,
    grant_id: principal.grant_id,
    user_id: principal.user_id,
    resource: principal.resource,
    scopes: principal.scopes,
    expires_at: principal.expires_at,
  }
}

async function readAccessTokenParticipants(
  tokenHash: string,
  query: TransactionQuery,
): Promise<(string | null)[]> {
  const result = await query<{ user_id: string; owner_user_id: string | null }>(
    `/* validateOAuthAccessToken participants */ SELECT oauth_grant.user_id, client.owner_user_id
     FROM oauth_access_tokens AS access
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = access.grant_id
     JOIN oauth_clients AS client ON client.id = oauth_grant.client_id
     WHERE access.token_hash = $1`,
    [tokenHash],
  )
  const row = result.rows[0]
  return row ? [row.user_id, row.owner_user_id] : []
}
