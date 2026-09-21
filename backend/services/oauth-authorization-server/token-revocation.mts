import { beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { assertOAuthClientAuthentication, getOAuthClient } from './clients.mts'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { OAuthProtocolError } from './errors.mts'
import { revokeOAuthRefreshFamily } from './refresh-family.mts'

export async function revokeOAuthToken(input: {
  clientId: string
  clientSecret?: string
  token: string
}): Promise<void> {
  await using query = await beginTransaction()
  const client = await getOAuthClient(input.clientId, query)
  if (!client) {
    throw new OAuthProtocolError('invalid_client', 'client authentication failed', 401)
  }
  assertOAuthClientAuthentication(client, input.clientSecret)
  const accessHash = hashToken(OAUTH_SECRET_PURPOSES.accessToken, input.token)
  const refreshHash = hashToken(OAUTH_SECRET_PURPOSES.refreshToken, input.token)

  const access = await query<{
    client_id: string
    grant_id: string
    id: string
    resource: string
    scopes: string[]
    user_id: string
  }>(
    `/* revokeOAuthToken access */ UPDATE oauth_access_tokens AS access
     SET revoked_at = COALESCE(access.revoked_at, CURRENT_TIMESTAMP)
     FROM oauth_grants AS oauth_grant
     WHERE access.grant_id = oauth_grant.id
       AND oauth_grant.client_id = $1
       AND access.token_hash = $2
       AND access.revoked_at IS NULL
     RETURNING
       access.id,
       oauth_grant.client_id,
       oauth_grant.id AS grant_id,
       access.resource,
       access.scopes,
       oauth_grant.user_id`,
    [client.id, accessHash],
  )
  const revokedAccess = access.rows[0]
  if (revokedAccess) {
    await query(
      `/* revokeOAuthToken access event */ INSERT INTO oauth_authorization_server_events (
         event_type, access_token_id, user_id, client_id, grant_id, resource, scopes
       ) VALUES ('access_token_revoked', $1, $2, $3, $4, $5, $6::text[])
       ON CONFLICT (access_token_id) WHERE access_token_id IS NOT NULL DO NOTHING`,
      [
        revokedAccess.id,
        revokedAccess.user_id,
        revokedAccess.client_id,
        revokedAccess.grant_id,
        revokedAccess.resource,
        revokedAccess.scopes,
      ],
    )
  } else {
    const refresh = await query<{ family_id: string }>(
      `/* revokeOAuthToken refresh */ SELECT refresh.family_id
       FROM oauth_refresh_tokens AS refresh
       JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
       JOIN oauth_grants AS oauth_grant ON oauth_grant.id = family.grant_id
       WHERE oauth_grant.client_id = $1
         AND refresh.token_hash = $2
       FOR UPDATE OF refresh, family, oauth_grant`,
      [client.id, refreshHash],
    )
    const familyId = refresh.rows[0]?.family_id
    if (familyId) await revokeOAuthRefreshFamily(familyId, query, false)
  }
  await query.commit()
}
