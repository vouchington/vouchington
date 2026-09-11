import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { PublicTotpAuthenticator } from './types.mts'

export async function getTotpAuthenticatorsByUserId(
  userId: string,
  options: { limit?: number; after?: { id: string } } = {},
): Promise<{ results: PublicTotpAuthenticator[]; hasNextPage: boolean }> {
  const limit = options.limit ?? 25
  const query = sql`/* getTotpAuthenticatorsByUserId */
    SELECT id, name, created_at
    FROM user_totp_authenticators
    WHERE user_id = ${userId} AND verified_at IS NOT NULL
  `
  if (options.after) {
    query.append(sql` AND id > ${options.after.id}`)
  }
  query.append(sql` ORDER BY id ASC LIMIT ${limit + 1}`)
  const { rows } = await read(query)

  const hasNextPage = rows.length > limit
  const results = rows.slice(0, limit) as PublicTotpAuthenticator[]
  return { results, hasNextPage }
}
