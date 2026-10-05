import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { generateApiKey } from './generate.mts'
import { addKeyHashToBloomFilter } from './bloom-filter.mts'
import type { ApiKey } from './types.mts'
import type { ApiKeyType } from './format.mts'
import { validateApiKeyCreationScopeSet } from './permissions.mts'
import { lockApiKeyOwner, resolveApiKeyLifetimeDays, type ApiKeyLifetimeDays } from './lifetime.mts'

export async function createApiKey(
  userId: string,
  type: ApiKeyType,
  label: string,
  permissions: readonly string[],
  lifetimeDays?: ApiKeyLifetimeDays,
): Promise<{ apiKey: ApiKey; rawKey: string }> {
  const { rawKey, prefix, keyHash } = generateApiKey(type)

  try {
    await using query = await beginTransaction()
    const isAdministrator = await lockApiKeyOwner(query, userId)
    const days = resolveApiKeyLifetimeDays(isAdministrator, lifetimeDays)
    const permissionResult = validateApiKeyCreationScopeSet(type, permissions)
    if (!permissionResult.valid) throw new Error(`createApiKey: ${permissionResult.error}`)
    const result = await query(sql`/* createApiKey */
        WITH new_key AS (SELECT uuidv7() AS id)
        INSERT INTO api_keys (id, user_id, prefix, key_hash, type, label, scopes, expires_at)
        SELECT new_key.id,
          ${userId}::uuid,
          ${prefix},
          ${keyHash},
          ${type},
          ${label},
          ${permissionResult.permissions}::api_scopes[],
          CASE WHEN ${days}::integer IS NULL THEN NULL
            ELSE uuid_extract_timestamp(new_key.id) + ${days}::integer * INTERVAL '24 hours' END
        FROM new_key
        RETURNING id, user_id, prefix, type, label, scopes::text[] AS permissions, created_at, last_used_at,
          revoked_at, expires_at, replaced_by_api_key_id, expiry_reminder_sent_at, updated_at
      `)
    await query.commit()
    const rows = result.rows

    const apiKey = rows[0]
    if (!apiKey) throw new Error('createApiKey: INSERT returned no rows')

    await addKeyHashToBloomFilter(keyHash)

    return { apiKey: apiKey as ApiKey, rawKey }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
