import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Hold the same exclusive case lifetime lock used by retention erasure around a real writer. */
export async function withCopyrightCaseErasureExclusiveLock<Result>(
  noticeId: string,
  operation: () => Promise<Result>,
): Promise<Result> {
  await using transaction = await beginTransaction()
  await transaction(sql`/* holdCopyrightCaseErasureExclusiveLockForTest */
    SELECT pg_advisory_xact_lock(hashtextextended(
      'copyright-erasure:' || ${noticeId}::uuid::text, 0))`)
  const result = await operation()
  await transaction.commit()
  return result
}
