import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import onError from '@modules/on-error'
import type { ApiKey } from './types.mts'

export async function searchApiKeys(
  currentUserId: string,
  options: { limit?: number; afterId?: string } = {},
) {
  const limit = options.limit ?? 25
  try {
    const query = sql`/* searchApiKeys */
      SELECT id, user_id, prefix, type, label, permissions, created_at, last_used_at, revoked_at, updated_at
      FROM api_keys
      WHERE user_id = ${currentUserId}
        AND revoked_at IS NULL
    `
    if (options.afterId) query.append(sql` AND id < ${options.afterId}`)
    query.append(sql` ORDER BY id DESC LIMIT ${limit + 1}`)
    const { rows } = await read(query)
    const hasNextPage = rows.length > limit
    const results = rows.slice(0, limit) as ApiKey[]
    return { results, hasNextPage }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}
