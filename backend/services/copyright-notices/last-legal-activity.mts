import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Called in the transaction that writes a substantive case fact. */
export async function advanceCopyrightLastLegalActivityAt(
  query: TransactionQuery,
  noticeId: string,
  at: Date = new Date(),
): Promise<void> {
  await query(sql`/* advanceCopyrightLastLegalActivityAt */
    UPDATE copyright_notices
    SET last_legal_activity_at = GREATEST(last_legal_activity_at, ${at}, clock_timestamp())
    WHERE id = ${noticeId}`)
}
