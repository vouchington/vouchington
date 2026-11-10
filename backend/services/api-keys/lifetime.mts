import sql from 'sql-template-strings'
import type { TransactionQuery } from '@data-stores/psql'
import createError from 'http-errors'

export type ApiKeyLifetimeDays = 30 | 90 | 365 | null

export async function getActiveApiKeyOwnerRole(
  query: TransactionQuery,
  userId: string,
): Promise<boolean> {
  const { rows } = await query(sql`/* getActiveApiKeyOwnerRole */
    SELECT EXISTS (
      SELECT 1 FROM user_roles
      JOIN user_role_types ON user_role_types.id = user_roles.role_type_id
      WHERE user_roles.user_id = ${userId}::uuid AND user_role_types.slug = 'administrator'
    ) AS is_administrator
    FROM users WHERE id = ${userId}::uuid AND deleted_at IS NULL
  `)
  if (!rows[0]) throw createError(404, 'User not found')
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
    AND EXISTS (SELECT 1 FROM users WHERE id = api_keys.user_id AND deleted_at IS NULL)
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
