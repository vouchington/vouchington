import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import { generateApiKey } from './generate.mts'
import { addKeyHashToBloomFilter } from './bloom-filter.mts'
import type { ApiKey } from './types.mts'
import type { ApiKeyType } from './format.mts'
import { validateApiKeyCreationScopeSet } from './permissions.mts'

export async function createApiKey(
  userId: string,
  type: ApiKeyType,
  label: string,
  permissions: readonly string[],
): Promise<{ apiKey: ApiKey; rawKey: string }> {
  const { rawKey, prefix, keyHash } = generateApiKey(type)

  try {
    await using query = await beginTransaction()
    await query(sql`/* createApiKey */ SELECT fn_lock_active_user_for_mutation(${userId})`)
    const ownerResult = await query(sql`/* createApiKey owner roles */
      SELECT EXISTS (
        SELECT 1
        FROM user_roles
        JOIN user_roles_types ON user_roles_types.id = user_roles.role_type_id
        WHERE user_roles.user_id = ${userId}::uuid
          AND user_roles_types.slug = 'administrator'
      ) AS is_administrator
    `)
    const permissionResult = validateApiKeyCreationScopeSet(
      { roles: ownerResult.rows[0]?.is_administrator === true ? ['administrator'] : [] },
      type,
      permissions,
    )
    if (!permissionResult.valid) throw new Error(`createApiKey: ${permissionResult.error}`)
    const result = await query(sql`/* createApiKey */
        INSERT INTO api_keys (user_id, prefix, key_hash, type, label, permissions)
        VALUES (
          ${userId}::uuid,
          ${prefix},
          ${keyHash},
          ${type},
          ${label},
          ${permissionResult.permissions}
        )
        RETURNING id, user_id, prefix, type, label, permissions, created_at, last_used_at, revoked_at, updated_at
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
