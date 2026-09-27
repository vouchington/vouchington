import type { TransactionQuery } from '@data-stores/psql'

/** Revokes one bounded OAuth credential page owned by a deleting user. */
export async function revokeOAuthCredentialsForDeletedUserBatch(
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  const pages = [
    revokeOwnedClients,
    revokeGrants,
    revokeFamilies,
    revokeAccessTokens,
    revokeRefreshTokens,
  ]
  for (const page of pages) {
    // oxlint-disable-next-line no-await-in-loop -- deletion pages commit one bounded mutation per job.
    if (await page(userId, batchSize, query)) return true
  }
  return false
}

async function revokeOwnedClients(
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  return mutatePage(
    `/* revokeOAuthCredentialsForDeletedUser:clients */ UPDATE oauth_clients
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id IN (SELECT id FROM oauth_clients WHERE owner_user_id = $1 AND revoked_at IS NULL ORDER BY id LIMIT $2)`,
    userId,
    batchSize,
    query,
  )
}

async function revokeGrants(
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  return mutatePage(
    `/* revokeOAuthCredentialsForDeletedUser:grants */ UPDATE oauth_grants
     SET revoked_at = CURRENT_TIMESTAMP
     WHERE id IN (SELECT id FROM oauth_grants WHERE user_id = $1 AND revoked_at IS NULL ORDER BY id LIMIT $2)`,
    userId,
    batchSize,
    query,
  )
}

async function revokeFamilies(
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  const result = await query<{ count: number }>(
    `/* revokeOAuthCredentialsForDeletedUser:families */ WITH candidates AS (
       SELECT family.id FROM oauth_refresh_token_families family JOIN oauth_grants oauth_grant ON oauth_grant.id = family.grant_id
       WHERE oauth_grant.user_id = $1 AND family.revoked_at IS NULL ORDER BY family.id LIMIT $2
     ), updated AS (
       UPDATE oauth_refresh_token_families family SET revoked_at = CURRENT_TIMESTAMP FROM candidates
       WHERE family.id = candidates.id RETURNING family.id, family.grant_id, family.resource, family.scopes
     ), events AS (
       INSERT INTO oauth_authorization_server_events
         (event_type, refresh_token_family_id, user_id, client_id, grant_id, resource, scopes)
       SELECT 'refresh_family_revoked', updated.id, $1, oauth_grant.client_id, updated.grant_id,
         updated.resource, updated.scopes FROM updated
       JOIN oauth_grants oauth_grant ON oauth_grant.id = updated.grant_id
       ON CONFLICT (refresh_token_family_id, event_type)
         WHERE refresh_token_family_id IS NOT NULL DO NOTHING
     ) SELECT COUNT(*)::int AS count FROM updated`,
    [userId, batchSize],
  )
  return (result.rows[0]?.count ?? 0) > 0
}

async function revokeAccessTokens(
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  return mutatePage(
    `/* revokeOAuthCredentialsForDeletedUser:access */ UPDATE oauth_access_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE id IN (SELECT access.id FROM oauth_access_tokens access JOIN oauth_grants oauth_grant ON oauth_grant.id = access.grant_id
       WHERE oauth_grant.user_id = $1 AND access.revoked_at IS NULL ORDER BY access.id LIMIT $2)`,
    userId,
    batchSize,
    query,
  )
}

async function revokeRefreshTokens(
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  return mutatePage(
    `/* revokeOAuthCredentialsForDeletedUser:refresh */ UPDATE oauth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE id IN (SELECT refresh.id FROM oauth_refresh_tokens refresh JOIN oauth_refresh_token_families family ON family.id = refresh.family_id
       JOIN oauth_grants oauth_grant ON oauth_grant.id = family.grant_id WHERE oauth_grant.user_id = $1 AND refresh.revoked_at IS NULL ORDER BY refresh.id LIMIT $2)`,
    userId,
    batchSize,
    query,
  )
}

async function mutatePage(
  statement: string,
  userId: string,
  batchSize: number,
  query: TransactionQuery,
): Promise<boolean> {
  return ((await query(statement, [userId, batchSize])).rowCount ?? 0) > 0
}
