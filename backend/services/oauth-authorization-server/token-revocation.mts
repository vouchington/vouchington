import { beginTransaction } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { authenticateLockedOAuthClient } from './clients.mts'
import { lockOAuthParticipantUsers } from './active-users.mts'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import { revokeOAuthRefreshFamily } from './refresh-family.mts'

export async function revokeOAuthToken(input: {
  clientId: string
  clientSecret?: string
  token: string
}): Promise<void> {
  await using query = await beginTransaction()
  const accessHash = hashToken(OAUTH_SECRET_PURPOSES.accessToken, input.token)
  const refreshHash = hashToken(OAUTH_SECRET_PURPOSES.refreshToken, input.token)
  const activeParticipantIds = await lockOAuthParticipantUsers(
    await readTokenParticipants(accessHash, refreshHash, input.clientId, query),
    query,
  )
  const client = await authenticateLockedOAuthClient(
    input.clientId,
    input.clientSecret,
    query,
    activeParticipantIds,
  )
  if (
    !(await tokenParticipantsAreActive(
      accessHash,
      refreshHash,
      client.id,
      activeParticipantIds,
      query,
    ))
  ) {
    await query.commit()
    return
  }

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

async function readTokenParticipants(
  accessHash: string,
  refreshHash: string,
  inputClientId: string,
  query: Parameters<typeof lockOAuthParticipantUsers>[1],
): Promise<(string | null)[]> {
  const artifacts = await query<{ user_id: string; owner_user_id: string | null }>(
    `/* revokeOAuthToken participants */ SELECT oauth_grant.user_id, client.owner_user_id
     FROM oauth_access_tokens AS access
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = access.grant_id
     JOIN oauth_clients AS client ON client.id = oauth_grant.client_id
     WHERE access.token_hash = $1
     UNION ALL
     SELECT oauth_grant.user_id, client.owner_user_id
     FROM oauth_refresh_tokens AS refresh
     JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = family.grant_id
     JOIN oauth_clients AS client ON client.id = oauth_grant.client_id
     WHERE refresh.token_hash = $2`,
    [accessHash, refreshHash],
  )
  const client = await query<{ owner_user_id: string | null }>(
    `/* revokeOAuthToken input client participant */ SELECT owner_user_id FROM oauth_clients WHERE client_id = $1`,
    [inputClientId],
  )
  return [
    ...artifacts.rows.flatMap(row => [row.user_id, row.owner_user_id]),
    client.rows[0]?.owner_user_id ?? null,
  ]
}

async function tokenParticipantsAreActive(
  accessHash: string,
  refreshHash: string,
  clientId: string,
  activeParticipantIds: ReadonlySet<string>,
  query: Parameters<typeof lockOAuthParticipantUsers>[1],
): Promise<boolean> {
  const result = await query<{ user_id: string; owner_user_id: string | null }>(
    `/* revokeOAuthToken active participants */ SELECT oauth_grant.user_id, client.owner_user_id
     FROM oauth_access_tokens AS access
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = access.grant_id
     JOIN oauth_clients AS client ON client.id = oauth_grant.client_id
     WHERE access.token_hash = $1 AND client.id = $3
     UNION ALL
     SELECT oauth_grant.user_id, client.owner_user_id
     FROM oauth_refresh_tokens AS refresh
     JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = family.grant_id
     JOIN oauth_clients AS client ON client.id = oauth_grant.client_id
     WHERE refresh.token_hash = $2 AND client.id = $3`,
    [accessHash, refreshHash, clientId],
  )
  return (
    result.rows.length === 0 ||
    result.rows.every(
      row =>
        activeParticipantIds.has(row.user_id) &&
        (!row.owner_user_id || activeParticipantIds.has(row.owner_user_id)),
    )
  )
}
