import type { TransactionQuery } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { getCopyrightRetentionWindows } from './config.mts'

/** Invoke before and after intake row locks; first association can commit during a row-lock wait. */
export async function lockCopyrightIntakeCaseLifetimes(
  query: TransactionQuery,
  intakeIds: readonly string[],
): Promise<void> {
  if (intakeIds.length > getCopyrightRetentionWindows().encryptionOwnerBatchSize)
    throw new RangeError('Copyright intake lifetime page exceeds its cap')
  if (!intakeIds.length) return
  const { rows } = await query<{ locked: boolean }>(sql`/* lockCopyrightIntakeCaseLifetimes */
    WITH owners AS MATERIALIZED (SELECT DISTINCT copyright_notice_id
      FROM copyright_notice_email_intake_notice_links
      WHERE copyright_notice_email_intake_receipt_id = ANY(${[...intakeIds]}::uuid[]) ORDER BY copyright_notice_id)
    SELECT pg_try_advisory_xact_lock_shared(hashtextextended('copyright-erasure:' || copyright_notice_id::text, 0)) AS locked FROM owners`)
  if (rows.some(row => !row.locked)) throw new Error('Copyright intake case erasure is in progress')
}
