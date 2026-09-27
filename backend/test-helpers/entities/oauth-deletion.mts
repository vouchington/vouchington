import { beginTransaction, read, write, type TransactionQuery } from '@data-stores/psql'

type CredentialKind = 'client' | 'grant' | 'family' | 'access' | 'refresh'

export type TestOAuthDeletionRow = {
  kind: CredentialKind
  id: string
  revoked_at: Date | null
}

/** Runs real credential mutations inside a transaction that is deliberately rolled back. */
export async function withTestOAuthDeletionRollback<T>(
  operation: (query: TransactionQuery) => Promise<T>,
): Promise<T> {
  await using query = await beginTransaction()
  const result = await operation(query)
  await query.rollback()
  return result
}

/** Includes children of revoked grants and families: finalization must inspect them independently. */
export async function getTestOAuthDeletionRows(userId: string): Promise<TestOAuthDeletionRow[]> {
  const { rows } = await read<TestOAuthDeletionRow>(
    `/* getTestOAuthDeletionRows */
     SELECT 'client' AS kind, id, revoked_at FROM oauth_clients WHERE owner_user_id = $1
     UNION ALL
     SELECT 'grant', id, revoked_at FROM oauth_grants WHERE user_id = $1
     UNION ALL
     SELECT 'family', family.id, family.revoked_at FROM oauth_refresh_token_families family
       JOIN oauth_grants oauth_grant ON oauth_grant.id = family.grant_id WHERE oauth_grant.user_id = $1
     UNION ALL
     SELECT 'access', access.id, access.revoked_at FROM oauth_access_tokens access
       JOIN oauth_grants oauth_grant ON oauth_grant.id = access.grant_id WHERE oauth_grant.user_id = $1
     UNION ALL
     SELECT 'refresh', refresh.id, refresh.revoked_at FROM oauth_refresh_tokens refresh
       JOIN oauth_refresh_token_families family ON family.id = refresh.family_id
       JOIN oauth_grants oauth_grant ON oauth_grant.id = family.grant_id WHERE oauth_grant.user_id = $1
     ORDER BY kind, id`,
    [userId],
  )
  return rows
}

export async function getTestOAuthDeletionFamilyEvents(userId: string): Promise<string[]> {
  const { rows } = await read<{ refresh_token_family_id: string }>(
    `/* getTestOAuthDeletionFamilyEvents */ SELECT refresh_token_family_id
     FROM oauth_authorization_server_events
     WHERE user_id = $1 AND event_type = 'refresh_family_revoked'
     ORDER BY refresh_token_family_id`,
    [userId],
  )
  return rows.map(row => row.refresh_token_family_id)
}

export async function hasTestUserDeletionResidual(userId: string): Promise<boolean> {
  const { rows } = await read<{ remaining: boolean }>(
    `/* hasTestUserDeletionResidual */ SELECT fn_user_deletion_has_remaining_owned_data($1) AS remaining`,
    [userId],
  )
  return rows[0]?.remaining ?? false
}

export async function setTestOAuthDeletionRevokedAt(
  kind: CredentialKind,
  rowId: string,
  revokedAt: Date | null,
): Promise<void> {
  const table = {
    client: 'oauth_clients',
    grant: 'oauth_grants',
    family: 'oauth_refresh_token_families',
    access: 'oauth_access_tokens',
    refresh: 'oauth_refresh_tokens',
  }[kind]
  await write(
    `/* setTestOAuthDeletionRevokedAt */ UPDATE ${table} SET revoked_at = $2 WHERE id = $1`,
    [rowId, revokedAt],
  )
}

export async function expireTestOAuthDeletionChild(
  kind: 'access' | 'refresh',
  rowId: string,
): Promise<void> {
  const table = kind === 'access' ? 'oauth_access_tokens' : 'oauth_refresh_tokens'
  await write(
    `/* expireTestOAuthDeletionChild */ UPDATE ${table}
     SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 day' WHERE id = $1`,
    [rowId],
  )
}

export async function getTestOAuthClientAfterUserPurge(clientId: string): Promise<{
  owner_user_id: string | null
  revoked_at: Date | null
} | null> {
  const { rows } = await read<{ owner_user_id: string | null; revoked_at: Date | null }>(
    `/* getTestOAuthClientAfterUserPurge */ SELECT owner_user_id, revoked_at
     FROM oauth_clients WHERE client_id = $1`,
    [clientId],
  )
  return rows[0] ?? null
}

export async function getTestOAuthDeletionAuditCount(userId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* getTestOAuthDeletionAuditCount */ SELECT COUNT(*)::int AS count
     FROM oauth_authorization_server_events WHERE user_id = $1`,
    [userId],
  )
  return rows[0]?.count ?? 0
}
