import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { lockOAuthParticipantUsers } from './active-users.mts'
import { authenticateLockedOAuthClient } from './clients.mts'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'
import type { OAuthClient } from './types.mts'

/** Fences every participant before taking the client lock used by refresh exchange. */
export async function authenticateRefreshClientAfterParticipantFence(
  input: { clientId: string; clientSecret?: string; refreshToken: string },
  query: TransactionQuery,
): Promise<{ activeParticipantIds: Set<string>; client: OAuthClient }> {
  const activeParticipantIds = await lockOAuthParticipantUsers(
    await readRefreshTokenParticipants(input.refreshToken, input.clientId, query),
    query,
  )
  const client = await authenticateLockedOAuthClient(
    input.clientId,
    input.clientSecret,
    query,
    activeParticipantIds,
  )
  return { activeParticipantIds, client }
}

async function readRefreshTokenParticipants(
  rawToken: string,
  inputClientId: string,
  query: TransactionQuery,
): Promise<(string | null)[]> {
  const result = await query<{
    grant_user_id: string
    artifact_owner_user_id: string | null
    input_owner_user_id: string | null
  }>(
    `/* exchangeOAuthRefreshToken participants */ SELECT oauth_grant.user_id AS grant_user_id,
       artifact_client.owner_user_id AS artifact_owner_user_id,
       input_client.owner_user_id AS input_owner_user_id
     FROM oauth_refresh_tokens AS refresh
     JOIN oauth_refresh_token_families AS family ON family.id = refresh.family_id
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = family.grant_id
     JOIN oauth_clients AS artifact_client ON artifact_client.id = oauth_grant.client_id
     LEFT JOIN oauth_clients AS input_client ON input_client.client_id = $2
     WHERE refresh.token_hash = $1`,
    [hashToken(OAUTH_SECRET_PURPOSES.refreshToken, rawToken), inputClientId],
  )
  const row = result.rows[0]
  if (row) return [row.grant_user_id, row.artifact_owner_user_id, row.input_owner_user_id]
  const client = await query<{ owner_user_id: string | null }>(
    `/* exchangeOAuthRefreshToken input client participant */ SELECT owner_user_id
     FROM oauth_clients WHERE client_id = $1`,
    [inputClientId],
  )
  return [client.rows[0]?.owner_user_id ?? null]
}
