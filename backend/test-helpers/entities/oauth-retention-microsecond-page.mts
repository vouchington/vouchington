import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import type { TransactionQuery } from '@data-stores/psql'

/** A retained first grant and a deletable second grant within one PostgreSQL millisecond. */
export async function createTestMicrosecondRevokedGrantPage(
  query: TransactionQuery,
  input: {
    userId: string
    clientId: string
    blockedRevokedAt: string
    deletableRevokedAt: string
  },
): Promise<{ blockedId: string; deletableId: string }> {
  const blockedId = uuidv7()
  const deletableId = uuidv7()
  // Cursor reset and fixtures stay uncommitted. The caller's rollback restores global state.
  await query(
    `/* createTestMicrosecondRevokedGrantPage:cursor */
     INSERT INTO security_retention_cleanup_cursors (source, cursor_at, cursor_id)
     VALUES ('oauth_grants', NULL, NULL)
     ON CONFLICT (source) DO UPDATE SET cursor_at = NULL, cursor_id = NULL`,
  )
  await query(
    `/* createTestMicrosecondRevokedGrantPage:grants */ INSERT INTO oauth_grants
       (id, user_id, client_id, resource, scopes, revoked_at)
     SELECT grant_input.id, $2::uuid, client.id, 'https://test.voucha.ai/mcp',
       ARRAY['mcp.user:read']::api_scopes[], grant_input.revoked_at
     FROM oauth_clients client
     CROSS JOIN (VALUES ($1::uuid, $4::timestamptz), ($5::uuid, $6::timestamptz))
       AS grant_input(id, revoked_at)
     WHERE client.client_id = $3::text`,
    [
      blockedId,
      input.userId,
      input.clientId,
      input.blockedRevokedAt,
      deletableId,
      input.deletableRevokedAt,
    ],
  )
  await query(
    `/* createTestMicrosecondRevokedGrantPage:code */ INSERT INTO oauth_authorization_codes
       (grant_id, code_hash, redirect_uri, resource, scopes, code_challenge, expires_at)
     VALUES ($1::uuid, $2::text, 'https://test.voucha.ai/callback',
       'https://test.voucha.ai/mcp', ARRAY['mcp.user:read']::api_scopes[],
       $3::text, CURRENT_TIMESTAMP + INTERVAL '1 day')`,
    [blockedId, randomBytes(32).toString('hex'), 'A'.repeat(43)],
  )
  return { blockedId, deletableId }
}

export async function testOAuthGrantExists(
  query: TransactionQuery,
  grantId: string,
): Promise<boolean> {
  const { rows } = await query(
    `/* testOAuthGrantExists */ SELECT 1 FROM oauth_grants WHERE id = $1`,
    [grantId],
  )
  return rows.length > 0
}

export async function testSecurityRetentionCursorAt(
  query: TransactionQuery,
  expectedAt: string,
): Promise<boolean> {
  const { rows } = await query<{ exact: boolean }>(
    `/* testSecurityRetentionCursorAt */ SELECT cursor_at = $1::timestamptz AS exact
     FROM security_retention_cleanup_cursors WHERE source = 'oauth_grants'`,
    [expectedAt],
  )
  return rows[0]?.exact ?? false
}
