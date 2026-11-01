import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from '../services/copyright-notices/erased-ciphertext.mts'

/** Applies the retention permit to precisely one owned intake, preserving its receipt. */
export async function eraseTestCopyrightEmailIntakeSender(
  intakeId: string,
  eraseOriginal: boolean,
) {
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* eraseTestCopyrightEmailIntakeSender:permit */ SET LOCAL session_replication_role = replica`,
  )
  await transaction(
    sql`/* eraseTestCopyrightEmailIntakeSender:eraseSender */
    UPDATE copyright_notice_email_intake_parses SET sender_email_ciphertext = ${COPYRIGHT_ERASED_CIPHERTEXT}
    WHERE copyright_notice_email_intake_id = ${intakeId}`,
  )
  if (eraseOriginal) {
    await transaction(
      sql`/* eraseTestCopyrightEmailIntakeSender:eraseOriginal */
      UPDATE copyright_notice_email_intakes SET raw_storage_object_id = NULL
      WHERE id = ${intakeId}`,
    )
  }
  await transaction.commit()
}
