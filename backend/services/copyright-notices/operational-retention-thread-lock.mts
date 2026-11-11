import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Hold writers take their account lock first, then this gate; the sweep never locks accounts. */
export async function lockCopyrightThreadPreservationGate(
  transaction: TransactionQuery,
  noticeId: string,
): Promise<void> {
  await transaction(sql`/* lockCopyrightThreadPreservationGate */
    SELECT pg_advisory_xact_lock(hashtextextended('copyright-preservation-retention', 0))`)
  await transaction(sql`/* lockCopyrightThreadRetentionNotice */
    SELECT id FROM copyright_notices WHERE id = ${noticeId} FOR UPDATE`)
}
