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

/** Correspondence writes every listed notice clock; own their trigger rows in identity order. */
export async function lockCopyrightActionGenerationsForWrite(
  noticeIds: readonly string[],
  query: TransactionQuery,
): Promise<void> {
  await query(sql`/* lockCopyrightActionGenerationsForWrite */
    SELECT copyright_notice_id FROM copyright_notice_thread_blocker_generations
    WHERE copyright_notice_id = ANY(${noticeIds}::uuid[])
    ORDER BY copyright_notice_id FOR UPDATE
  `)
}
