import { FINAL_USER_PURGE_LOCK_KEY } from '@modules/utils/final-user-purge-lock'
import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** The caller owns the notice. Thread workers cannot publish another same-case cursor then. */
export async function lockCopyrightMinimalPurgeCursorReferences(
  query: TransactionQuery,
  noticeId: string,
): Promise<void> {
  await query(sql`/* lockCopyrightMinimalPurgeCursorReferences */
    WITH candidate AS MATERIALIZED (
      -- The enum-keyed domain has eight rows; catalog conformance binds that cardinality.
      SELECT kind, cursor_blocker_assessment_identity_id
      FROM copyright_notice_operational_retention_cursors ORDER BY kind LIMIT 9
    )
    SELECT cursor.kind FROM candidate
    JOIN copyright_notice_submission_assessment_identities assessment
      ON assessment.id = candidate.cursor_blocker_assessment_identity_id
    JOIN copyright_notice_operational_retention_cursors cursor ON cursor.kind = candidate.kind
    WHERE assessment.copyright_notice_id = ${noticeId}
    ORDER BY cursor.kind FOR UPDATE OF cursor NOWAIT`)
}

/** A failed NOWAIT transaction is disposed before the outer run returns more; never retry SQL in it. */
export function isCopyrightMinimalPurgeCursorBusy(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03'
}

/** Final user purge owns this key exclusively before taking user/case row locks. */
export async function lockCopyrightMinimalPurgeUserClock(query: TransactionQuery): Promise<void> {
  await query(
    sql`/* setCopyrightMinimalPurgeTimeouts */ SELECT set_config('lock_timeout', '5s', true)`,
  )
  await query(sql`/* lockCopyrightMinimalPurgeUserClock */
    SELECT pg_advisory_xact_lock_shared(hashtextextended(${FINAL_USER_PURGE_LOCK_KEY}, 0))`)
}
