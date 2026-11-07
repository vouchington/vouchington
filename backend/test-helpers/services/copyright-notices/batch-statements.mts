import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

export async function countTestAppealReversalEvents(
  transaction: TransactionQuery,
  noticeId: string,
): Promise<number> {
  const { rows } = await transaction<{ total: number }>(sql`/* countTestAppealReversalEvents */
    SELECT count(*)::int AS total FROM copyright_claimant_misuse_events
    WHERE copyright_notice_id = ${noticeId}
  `)
  return rows[0]?.total ?? 0
}

/** Reports, per key in key order, whether this transaction could take its advisory lock right now. */
export async function tryTestAdvisoryKeyLocks(
  transaction: TransactionQuery,
  keys: readonly string[],
): Promise<boolean[]> {
  const { rows } = await transaction<{ acquired: boolean }>(sql`/* tryTestAdvisoryKeyLocks */
    SELECT pg_try_advisory_xact_lock(hashtextextended(lock_key.key, 0)) AS acquired
    FROM unnest(${keys}::text[]) WITH ORDINALITY AS lock_key(key, position)
    ORDER BY lock_key.position
  `)
  return rows.map(row => row.acquired)
}
