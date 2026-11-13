import { beginTransaction, read } from '@data-stores/psql'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import sql from 'sql-template-strings'

/** Applies the retention permit to precisely one owned intake's original pointer. */
export async function eraseTestCopyrightEmailIntakeOriginal(intakeId: string) {
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* eraseTestCopyrightEmailIntakeOriginal:permit */ SET LOCAL app.copyright_retention_erasure = 'on'`,
  )
  await transaction(
    sql`/* eraseTestCopyrightEmailIntakeOriginal:erase */
    UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL
    WHERE id = ${intakeId}`,
  )
  await transaction.commit()
}

/** First retention tick marks the receipt before physical evidence removal. */
export async function markTestCopyrightEmailIntakeReceiptErased(intakeId: string) {
  await using transaction = await beginTransaction()
  await transaction(sql`/* markTestCopyrightEmailIntakeReceiptErased:permit */
    SET LOCAL app.copyright_retention_erasure = 'on'`)
  await transaction(sql`/* markTestCopyrightEmailIntakeReceiptErased */
    UPDATE copyright_notice_email_intake_receipts SET erased_at = CURRENT_TIMESTAMP
    WHERE id = ${intakeId}`)
  await transaction.commit()
}

/** Commit the first erasure tick while a real source insert waits on its receipt guard. */
export async function writeCopyrightEmailAfterReceiptErasure<Result>(
  intakeId: string,
  writeSource: () => Promise<Result>,
): Promise<Result> {
  await using erasure = await beginTransaction()
  await erasure(sql`/* writeCopyrightEmailAfterReceiptErasure:permit */
    SET LOCAL app.copyright_retention_erasure = 'on'`)
  await erasure(sql`/* writeCopyrightEmailAfterReceiptErasure:marker */
    UPDATE copyright_notice_email_intake_receipts SET erased_at = CURRENT_TIMESTAMP
    WHERE id = ${intakeId}`)
  const holderProcessId = await getTestPostgresBackendProcessId(erasure)
  return await withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'transaction' },
      queryMarker: 'insertCopyrightEmailThreadReferences',
      releaseHolder: () => erasure[Symbol.asyncDispose](),
    },
    async waitForLock => {
      const pending = writeSource()
      await waitForLock(pending)
      await erasure.commit()
      return pending
    },
  )
}

/** Read only the private references owned by this intake. */
export async function readTestCopyrightEmailThreadReferences(intakeId: string): Promise<string[]> {
  const { rows } = await read<{
    reference_kind: string
  }>(sql`/* readTestCopyrightEmailThreadReferences */
    SELECT reference_kind FROM copyright_notice_email_thread_references
    WHERE copyright_notice_email_intake_id = ${intakeId} ORDER BY reference_kind`)
  return rows.map(row => row.reference_kind)
}
