import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Lightweight liveness gate: whether a user id still resolves to a non-soft-deleted row.
// Deliberately returns a single boolean rather than a full PrivateUser — callers on a serialized
// background path (e.g. bloom filter backfill racing a user's own deletion) only need to know
// whether to proceed, not to read PII.
export async function isUserActive(userId: string, options: QueryOptions = {}): Promise<boolean> {
  const run = options.query ?? read
  const { rows } = await run<{ exists: boolean }>(sql`/* isUserActive */
    SELECT TRUE AS exists
    FROM users
    WHERE id = ${userId}
      AND deleted_at IS NULL
  `)
  return rows.length > 0
}
