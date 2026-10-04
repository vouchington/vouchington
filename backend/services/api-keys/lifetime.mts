import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'
import createError from 'http-errors'

export type ApiKeyLifetimeDays = 30 | 90 | 365 | null

export async function lockApiKeyOwner(query: TransactionQuery, userId: string): Promise<boolean> {
  await query(sql`/* lockApiKeyOwner */ SELECT fn_lock_active_user_for_mutation(${userId})`)
  const { rows } = await query(sql`/* lockApiKeyOwner */
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      JOIN user_role_types ON user_role_types.id = user_roles.role_type_id
      WHERE user_roles.user_id = ${userId}::uuid AND user_role_types.slug = 'administrator'
    ) AS is_administrator
  `)
  return rows[0]!.is_administrator as boolean
}

export function resolveApiKeyLifetimeDays(
  isAdministrator: boolean,
  lifetimeDays: ApiKeyLifetimeDays | undefined,
): ApiKeyLifetimeDays {
  const days = lifetimeDays === undefined ? (isAdministrator ? 30 : 90) : lifetimeDays
  if (days !== null && ![30, 90, 365].includes(days))
    throw createError(400, 'Invalid API key lifetime')
  if (isAdministrator && (days === null || days > 90)) {
    throw createError(400, 'Administrator API keys must expire within 90 days')
  }
  return days
}

// Shared by authentication reads and asynchronous usage updates, including role promotion.
export function apiKeyIsValidSql() {
  return sql`
    api_keys.revoked_at IS NULL
    AND (api_keys.expires_at IS NULL OR api_keys.expires_at > NOW())
    AND NOT EXISTS (
      SELECT 1 FROM user_roles
      JOIN user_role_types ON user_role_types.id = user_roles.role_type_id
      WHERE user_roles.user_id = api_keys.user_id
        AND user_role_types.slug = 'administrator'
        AND (api_keys.expires_at IS NULL
          OR api_keys.expires_at > api_keys.created_at + INTERVAL '2160 hours')
    )
  `
}
