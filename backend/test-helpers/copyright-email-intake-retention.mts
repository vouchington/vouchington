import { beginTransaction } from '@data-stores/psql'
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
