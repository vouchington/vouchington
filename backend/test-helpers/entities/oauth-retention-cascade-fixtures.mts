import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import type { TransactionQuery } from '@data-stores/psql'

export async function lockTestNeverGrantedOAuthClient(
  query: TransactionQuery,
  clientId: string,
  cutoffId: string,
): Promise<{ id: string; never_granted: boolean; aged: boolean } | undefined> {
  const { rows } = await query<{ id: string; never_granted: boolean; aged: boolean }>(
    `/* testNeverGrantedClientWithRequests:lock */ SELECT client.id,
       NOT EXISTS (SELECT 1 FROM oauth_client_grant_markers marker
         WHERE marker.client_id = client.id) AS never_granted,
       client.id < $2::uuid AS aged
     FROM oauth_clients client WHERE client.client_id = $1::text FOR UPDATE`,
    [clientId, cutoffId],
  )
  return rows[0]
}

export async function deleteTestOAuthClientWithPredicate(
  query: TransactionQuery,
  clientRowId: string,
  cutoffId: string,
  deletePredicate: string,
): Promise<number | null> {
  const result = await query(
    `/* testNeverGrantedClientWithRequests:delete */ DELETE FROM oauth_clients target
     WHERE target.id = $1::uuid AND target.id < $2::uuid
       AND ${deletePredicate}`,
    [clientRowId, cutoffId],
  )
  return result.rowCount
}

export async function drainTestOAuthAuthorizationRequestsForClient(
  query: TransactionQuery,
  clientRowId: string,
): Promise<number | null> {
  const result = await query(
    `/* testNeverGrantedClientWithRequests:drainFixture */
     DELETE FROM oauth_authorization_requests WHERE client_id = $1::uuid`,
    [clientRowId],
  )
  return result.rowCount
}

export async function insertTestRevokedOAuthGrantWithYoungArtifacts(
  query: TransactionQuery,
  input: {
    userId: string
    clientId: string
    revokedAt: Date
    futureExpiry: Date
  },
): Promise<{ grantId: string; familyId: string }> {
  const grantId = uuidv7()
  const familyId = uuidv7()
  await query(
    `/* testRevokedGrantWithChildren:grant */ INSERT INTO oauth_grants
       (id, user_id, client_id, resource, scopes, revoked_at)
     SELECT $1::uuid, $2::uuid, client.id, 'https://test.voucha.ai/mcp',
       ARRAY['mcp.user:read']::api_scopes[], $4::timestamptz
     FROM oauth_clients client WHERE client.client_id = $3::text`,
    [grantId, input.userId, input.clientId, input.revokedAt],
  )
  await query(
    `/* testRevokedGrantWithChildren:code */ INSERT INTO oauth_authorization_codes
       (grant_id, code_hash, redirect_uri, resource, scopes, code_challenge, expires_at)
     VALUES ($1::uuid, $2::text, 'https://test.voucha.ai/callback',
       'https://test.voucha.ai/mcp', ARRAY['mcp.user:read']::api_scopes[], $3::text, $4::timestamptz)`,
    [grantId, randomBytes(32).toString('hex'), 'A'.repeat(43), input.futureExpiry],
  )
  await query(
    `/* testRevokedGrantWithChildren:family */ INSERT INTO oauth_refresh_token_families
       (id, grant_id, resource, scopes, expires_at)
     VALUES ($1::uuid, $2::uuid, 'https://test.voucha.ai/mcp',
       ARRAY['mcp.user:read']::api_scopes[], $3::timestamptz)`,
    [familyId, grantId, input.futureExpiry],
  )
  await query(
    `/* testRevokedGrantWithChildren:refresh */ INSERT INTO oauth_refresh_tokens
       (family_id, token_hash, scopes, generation, expires_at)
     VALUES ($1::uuid, $2::text, ARRAY['mcp.user:read']::api_scopes[], 0, $3::timestamptz)`,
    [familyId, randomBytes(32).toString('hex'), input.futureExpiry],
  )
  await query(
    `/* testRevokedGrantWithChildren:access */ INSERT INTO oauth_access_tokens
       (grant_id, refresh_family_id, token_hash, resource, scopes, expires_at)
     VALUES ($1::uuid, $2::uuid, $3::text, 'https://test.voucha.ai/mcp',
       ARRAY['mcp.user:read']::api_scopes[], $4::timestamptz)`,
    [grantId, familyId, randomBytes(32).toString('hex'), input.futureExpiry],
  )
  return { grantId, familyId }
}

export async function lockTestOAuthGrantForUpdate(
  query: TransactionQuery,
  grantId: string,
): Promise<void> {
  await query(
    '/* testRevokedGrantWithChildren:lock */ SELECT id FROM oauth_grants WHERE id = $1::uuid FOR UPDATE',
    [grantId],
  )
}

export async function deleteTestOAuthGrantWithPredicate(
  query: TransactionQuery,
  grantId: string,
  deletePredicate: string,
): Promise<number | null> {
  const result = await query(
    `/* testRevokedGrantWithChildren:delete */ DELETE FROM oauth_grants target
     WHERE target.id = $1::uuid AND ${deletePredicate}`,
    [grantId],
  )
  return result.rowCount
}

export async function countTestOAuthGrantChildArtifacts(
  query: TransactionQuery,
  grantId: string,
  familyId: string,
): Promise<number | undefined> {
  const { rows } = await query<{ children: number }>(
    `/* testRevokedGrantWithChildren:remaining */ SELECT (
       (SELECT count(*) FROM oauth_authorization_codes WHERE grant_id = $1::uuid)
       + (SELECT count(*) FROM oauth_refresh_token_families WHERE grant_id = $1::uuid)
       + (SELECT count(*) FROM oauth_access_tokens WHERE grant_id = $1::uuid)
       + (SELECT count(*) FROM oauth_refresh_tokens WHERE family_id = $2::uuid))::integer AS children`,
    [grantId, familyId],
  )
  return rows[0]?.children
}
