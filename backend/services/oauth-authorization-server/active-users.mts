import type { TransactionQuery } from '@data-stores/psql'
import { hashToken } from '@modules/token-secrets'
import { OAUTH_SECRET_PURPOSES } from './constants.mts'

/**
 * Acquires the user-deletion fence for every OAuth participant before an OAuth artifact row is
 * locked. Callers re-read their artifact afterwards and choose the protocol-specific error.
 */
export async function lockOAuthParticipantUsers(
  userIds: readonly (string | null)[],
  query: TransactionQuery,
): Promise<Set<string>> {
  const participantIds = [...new Set(userIds.filter((userId): userId is string => userId !== null))]
  participantIds.sort()
  for (const userId of participantIds) {
    // oxlint-disable-next-line no-await-in-loop -- lifecycle locks must be acquired in UUID order.
    await query(
      `/* lockOAuthParticipantUsers */ SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [userId],
    )
  }
  if (participantIds.length === 0) return new Set()
  const result = await query<{ id: string }>(
    `/* lockOAuthParticipantUsers active */ SELECT id
     FROM users
     WHERE id = ANY($1::uuid[])
       AND deleted_at IS NULL`,
    [participantIds],
  )
  return new Set(result.rows.map(row => row.id))
}

export async function readOAuthAuthorizationCodeParticipantUserIds(
  rawCode: string,
  inputClientId: string,
  query: TransactionQuery,
): Promise<(string | null)[]> {
  const result = await query<{
    grant_user_id: string
    artifact_owner_user_id: string | null
    input_owner_user_id: string | null
  }>(
    `/* exchangeOAuthAuthorizationCode participants */ SELECT oauth_grant.user_id AS grant_user_id,
       artifact_client.owner_user_id AS artifact_owner_user_id,
       input_client.owner_user_id AS input_owner_user_id
     FROM oauth_authorization_codes AS code
     JOIN oauth_grants AS oauth_grant ON oauth_grant.id = code.grant_id
     JOIN oauth_clients AS artifact_client ON artifact_client.id = oauth_grant.client_id
     LEFT JOIN oauth_clients AS input_client ON input_client.client_id = $2
     WHERE code.code_hash = $1`,
    [hashToken(OAUTH_SECRET_PURPOSES.authorizationCode, rawCode), inputClientId],
  )
  const row = result.rows[0]
  if (row) return [row.grant_user_id, row.artifact_owner_user_id, row.input_owner_user_id]
  return readOAuthClientOwnerParticipant(inputClientId, query)
}

export async function readOAuthAuthorizationRequestParticipantUserIds(
  requestId: string,
  userId: string,
  query: TransactionQuery,
): Promise<(string | null)[]> {
  const result = await query<{ request_user_id: string; owner_user_id: string | null }>(
    `/* decideOAuthAuthorizationRequest participants */ SELECT request.user_id AS request_user_id,
       client.owner_user_id
     FROM oauth_authorization_requests AS request
     JOIN oauth_clients AS client ON client.id = request.client_id
     WHERE request.id = $1 AND request.user_id = $2`,
    [requestId, userId],
  )
  const row = result.rows[0]
  return row ? [row.request_user_id, row.owner_user_id] : [userId]
}

async function readOAuthClientOwnerParticipant(
  clientId: string,
  query: TransactionQuery,
): Promise<(string | null)[]> {
  const client = await query<{ owner_user_id: string | null }>(
    `/* OAuth client participant */ SELECT owner_user_id FROM oauth_clients WHERE client_id = $1`,
    [clientId],
  )
  return [client.rows[0]?.owner_user_id ?? null]
}
