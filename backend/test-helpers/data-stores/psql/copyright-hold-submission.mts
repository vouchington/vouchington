import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { copyrightSubmissionPurpose } from '../../../services/copyright-notices/submissions.mts'
import { openCopyrightSecrets } from '../../../services/copyright-notices/encryption-keys.mts'

/**
 * Records a court or CCB filing on a notice and returns its submission id. The statement is
 * encrypted for its own submission, so a staff case read that reaches the notice on a shared
 * database can decrypt it; a bare placeholder string would make every such read throw.
 */
export async function insertEncryptedCopyrightHoldSubmission(noticeId: string): Promise<string> {
  const id = uuidv7()
  const statement = JSON.stringify({ filing: `Court filing ${id}` })
  await using transaction = await beginTransaction()
  await using secrets = await openCopyrightSecrets(
    { kind: 'notice', id: noticeId },
    transaction,
    'write',
  )
  await transaction(sql`/* insertEncryptedCopyrightHoldSubmission */
    INSERT INTO copyright_notice_submissions (
      id, copyright_notice_id, kind, received_at, source_kind, submitted_by_id, body_ciphertext
    ) VALUES (
      ${id}, ${noticeId}, 'court_or_ccb_hold', ${new Date()}, 'email', NULL,
      ${secrets.encryptSecret(statement, copyrightSubmissionPurpose(id))}
    )`)
  await transaction.commit()
  return id
}
