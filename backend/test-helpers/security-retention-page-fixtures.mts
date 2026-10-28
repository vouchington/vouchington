import { randomBytes } from 'node:crypto'
import { v7 as uuidv7 } from 'uuid'
import type { TransactionQuery } from '@data-stores/psql'
import type { Source } from '../services/data-retention/security-record-plans.mts'

/** Position just before one owned row; the caller rolls back the shared cursor afterward. */
export async function positionSecurityRetentionFixture(
  query: TransactionQuery,
  source: Source,
  id: string,
  keyAt: Date,
): Promise<void> {
  const previous = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0')
  const previousId = `${previous.slice(0, 8)}-${previous.slice(8, 12)}-${previous.slice(12, 16)}-${previous.slice(16, 20)}-${previous.slice(20)}`
  await query(
    `/* positionSecurityRetentionFixture */
     INSERT INTO security_retention_cleanup_cursors (source, cursor_at, cursor_id)
     VALUES ($1::security_retention_sources, $2::timestamptz, $3::uuid)
     ON CONFLICT (source) DO UPDATE SET cursor_at = EXCLUDED.cursor_at, cursor_id = EXCLUDED.cursor_id`,
    [source, keyAt, previousId],
  )
}

/** Valid, unreferenced credentials isolate deletion from authorization and child-cascade behavior. */
export async function insertSecurityRetentionCredentialFixture(
  query: TransactionQuery,
  source: 'oauth_grant_anchors' | 'oauth_clients' | 'api_keys_revoked' | 'api_keys_expired',
  userId: string,
  keyAt: Date,
): Promise<string> {
  const id = uuidv7({ msecs: keyAt.getTime() })
  if (source === 'oauth_grant_anchors') {
    await query(
      `/* insertSecurityRetentionAnchor */ INSERT INTO oauth_grant_retention_anchors (id, user_id, ended_at)
       VALUES ($1::uuid, $2::uuid, $3::timestamptz)`,
      [id, userId, keyAt],
    )
  } else if (source === 'oauth_clients') {
    await query(
      `/* insertSecurityRetentionClient */ INSERT INTO oauth_clients
       (id, client_id, owner_user_id, client_name, client_type, token_endpoint_auth_method,
        redirect_uris, grant_types, response_types, scopes)
       VALUES ($1::uuid, $2, $3::uuid, 'Security retention fixture', 'public', 'none',
         ARRAY['https://example.com/callback'],
         ARRAY['authorization_code', 'refresh_token']::oauth_grant_types[],
         ARRAY['code']::oauth_response_types[], ARRAY['mcp.user:read']::api_scopes[])`,
      [id, `voucha_${randomBytes(24).toString('base64url')}`, userId],
    )
  } else if (source === 'api_keys_revoked') {
    await query(
      `/* insertSecurityRetentionRevokedKey */ INSERT INTO api_keys
       (id, user_id, prefix, key_hash, scopes, revoked_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, ARRAY['rss:read']::api_scopes[], $5::timestamptz)`,
      [id, userId, randomBytes(6).toString('hex'), randomBytes(32), keyAt],
    )
  } else {
    await query(
      `/* insertSecurityRetentionExpiredKey */ INSERT INTO api_keys
       (id, user_id, prefix, key_hash, scopes, expires_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, ARRAY['rss:read']::api_scopes[], $5::timestamptz)`,
      [id, userId, randomBytes(6).toString('hex'), randomBytes(32), keyAt],
    )
  }
  return id
}
