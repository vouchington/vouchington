import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ApiKey } from './types.mts'
import { apiKeyIsValidSql } from './lifetime.mts'

export async function getApiKeyByHash(keyHash: Buffer): Promise<ApiKey | null> {
  const { rows } = await read(
    sql`/* getApiKeyByHash */
    SELECT id, user_id, prefix, type, label, permissions, created_at, last_used_at,
      revoked_at, expires_at, replaced_by_api_key_id, expiry_reminder_sent_at, updated_at
    FROM api_keys
    WHERE key_hash = ${keyHash}
      AND `.append(apiKeyIsValidSql()).append(sql`
    LIMIT 1
  `),
  )
  return (rows[0] as ApiKey) ?? null
}
