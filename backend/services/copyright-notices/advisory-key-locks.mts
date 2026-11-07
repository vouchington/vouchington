import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'

/**
 * Takes transaction-scoped advisory locks for already-ordered keys in one statement. The caller
 * supplies the canonical lock order; `position` keeps it, so concurrent transactions lock the same
 * keys in the same order and cannot deadlock.
 */
export async function lockAdvisoryKeysInOrder(
  transaction: TransactionQuery,
  keys: readonly string[],
): Promise<void> {
  if (keys.length === 0) return
  await transaction(sql`/* lockCopyrightAdvisoryKeysInOrder */
    SELECT pg_advisory_xact_lock(hashtextextended(lock_key.key, 0))
    FROM unnest(${keys}::text[]) WITH ORDINALITY AS lock_key(key, position)
    ORDER BY lock_key.position
  `)
}
