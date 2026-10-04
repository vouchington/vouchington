import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import createError from 'http-errors'
import { generateApiKey } from './generate.mts'
import { addKeyHashToBloomFilter } from './bloom-filter.mts'
import { lockApiKeyOwner } from './lifetime.mts'
import type { ApiKey } from './types.mts'

export async function rotateApiKey(
  userId: string,
  id: string,
): Promise<{ apiKey: ApiKey; rawKey: string }> {
  await using query = await beginTransaction()
  const isAdministrator = await lockApiKeyOwner(query, userId)
  const { rows } = await query(sql`/* rotateApiKey */
    SELECT id, type, revoked_at, replaced_by_api_key_id, expires_at <= NOW() AS is_expired
    FROM api_keys WHERE id = ${id}::uuid AND user_id = ${userId}::uuid FOR UPDATE
  `)
  const old = rows[0] as
    | Pick<ApiKey, 'id' | 'type' | 'revoked_at' | 'replaced_by_api_key_id'>
    | undefined
  if (!old) throw createError(404, 'API key not found')
  if (old.revoked_at || old.replaced_by_api_key_id || rows[0]!.is_expired) {
    throw createError(409, 'API key is inactive or already replaced')
  }
  const { rawKey, prefix, keyHash } = generateApiKey(old.type)
  const replacement = await query(sql`/* rotateApiKey */
    WITH new_key AS (SELECT uuidv7() AS id)
    INSERT INTO api_keys (id, user_id, prefix, key_hash, type, label, scopes, expires_at)
    SELECT new_key.id, user_id, ${prefix}, ${keyHash}, type, label, scopes,
      CASE
        WHEN ${isAdministrator} AND (expires_at IS NULL OR expires_at > created_at + INTERVAL '2160 hours')
          THEN uuid_extract_timestamp(new_key.id) + INTERVAL '720 hours'
        WHEN expires_at IS NULL THEN NULL
        ELSE uuid_extract_timestamp(new_key.id) + EXTRACT(EPOCH FROM (expires_at - created_at)) * INTERVAL '1 second'
      END
    FROM api_keys CROSS JOIN new_key WHERE api_keys.id = ${id}::uuid
    RETURNING id, user_id, prefix, type, label, scopes::text[] AS permissions, created_at, last_used_at,
      revoked_at, expires_at, replaced_by_api_key_id, expiry_reminder_sent_at, updated_at
  `)
  const apiKey = replacement.rows[0] as ApiKey
  await query(sql`/* rotateApiKey */
    UPDATE api_keys SET replaced_by_api_key_id = ${apiKey.id}::uuid,
      expires_at = LEAST(expires_at, NOW() + INTERVAL '24 hours')
    WHERE id = ${id}::uuid
  `)
  await query.commit()
  await addKeyHashToBloomFilter(keyHash)
  return { apiKey, rawKey }
}
