import { write } from '@data-stores/psql'
import { encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { copyrightSubmissionPurpose } from '../../../services/copyright-notices/submissions.mts'

/**
 * Records a court or CCB filing on a notice and returns its submission id. The statement is
 * encrypted for its own submission, so a staff case read that reaches the notice on a shared
 * database can decrypt it; a bare placeholder string would make every such read throw.
 */
export async function insertEncryptedCopyrightHoldSubmission(noticeId: string): Promise<string> {
  const id = uuidv7()
  const statement = JSON.stringify({ filing: `Court filing ${id}` })
  await write(sql`/* insertEncryptedCopyrightHoldSubmission */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, kind, received_at, source_kind, submitted_by_user_id, body_ciphertext
    ) VALUES (
      ${id}, ${noticeId}, 'court_or_ccb_hold', ${new Date()}, 'email', NULL,
      ${encryptSecret(statement, copyrightSubmissionPurpose(id))}
    )`)
  return id
}
