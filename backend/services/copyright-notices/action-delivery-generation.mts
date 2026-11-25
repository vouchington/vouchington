import type { TransactionQuery } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'

declare const lockedGeneration: unique symbol

/** Proof that this transaction took the case generation row lock before any notice or submission lock. */
export type LockedCopyrightGeneration = {
  readonly noticeId: string
  readonly [lockedGeneration]: true
}

/** Acquire the existing row this transaction's work mutation writes through its trigger. */
export async function lockCopyrightActionGenerationForWrite(
  noticeId: string,
  query: TransactionQuery,
): Promise<LockedCopyrightGeneration> {
  await query(sql`/* lockCopyrightActionGenerationForWrite */
    SELECT copyright_notice_id FROM copyright_notice_thread_blocker_generations
    -- lock-reason: prevents: a generation update deadlocking with a competing child write
    -- writer: restriction and action-delivery writes that bump the generation through triggers
    WHERE copyright_notice_id = ${noticeId} FOR UPDATE
  `)
  return { noticeId } as LockedCopyrightGeneration
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

/** Own the generation of the case a submission belongs to; its case id is an immutable FK read unlocked. */
export async function lockCopyrightActionGenerationForSubmission(
  submissionId: string,
  query: TransactionQuery,
): Promise<LockedCopyrightGeneration> {
  const { rows } = await query<{ copyright_notice_id: string }>(sql`
    /* lockCopyrightActionGenerationForSubmission */
    SELECT copyright_notice_id FROM copyright_notice_submissions WHERE id = ${submissionId}
  `)
  assert(rows[0], 404, 'Copyright submission not found')
  return lockCopyrightActionGenerationForWrite(rows[0].copyright_notice_id, query)
}
