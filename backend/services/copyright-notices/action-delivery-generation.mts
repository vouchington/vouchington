import type { TransactionQuery } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

/** Acquire the existing row this transaction's work mutation writes through its trigger. */
export async function lockCopyrightActionGenerationForWrite(
  noticeId: string,
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockCopyrightActionGenerationForWrite */
    SELECT copyright_notice_id FROM copyright_notice_thread_blocker_generations
    WHERE copyright_notice_id = ${noticeId} FOR UPDATE
  `)
}
