import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { COPYRIGHT_ERASED_CIPHERTEXT } from '../services/copyright-notices/erased-ciphertext.mts'

/** Runs the policy's actual ciphertext overwrite for one case so the read model sees its sentinel. */
export async function eraseTestCopyrightSubmissionGuidanceForNotice(
  noticeId: string,
): Promise<void> {
  await using transaction = await beginTransaction()
  await transaction(
    sql`/* eraseTestCopyrightSubmissionGuidanceForNotice */ SET LOCAL session_replication_role = replica`,
  )
  await transaction(sql`/* eraseTestCopyrightSubmissionGuidanceForNotice */
    UPDATE copyright_notice_submission_guidance
    SET guidance_ciphertext = CASE WHEN guidance_ciphertext IS NULL THEN NULL
      ELSE ${COPYRIGHT_ERASED_CIPHERTEXT} END
    WHERE copyright_notice_submission_id IN (
      SELECT id FROM copyright_notice_submissions WHERE copyright_notice_id = ${noticeId})`)
  await transaction.commit()
}
