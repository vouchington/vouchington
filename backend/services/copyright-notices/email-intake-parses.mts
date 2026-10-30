import { openCopyrightOwnerSecretBatch } from './encryption-key-batch.mts'
import { insertCopyrightEmailAttachments } from './email-intake-attachments.mts'
import { beginTransaction } from '@data-stores/psql'
import { isCopyrightIntakeEnabled } from './activation.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from './email-intake-reply.mts'
import {
  isAuthenticatedCopyrightEmail,
  type CopyrightEmailSesVerdicts,
} from './email-ses-verdicts.mts'
import {
  prepareCopyrightIntakeEncryptionKey,
  attachCopyrightEncryptionKey,
} from './encryption-keys.mts'
import sql from 'sql-template-strings'
import {
  copyrightEmailIntakePurpose,
  ErasedCopyrightEmailIntakeReplay,
  type CopyrightEmailIntake,
} from './email-intakes.mts'
import {
  recordCopyrightEmailThreadReferences,
  type CopyrightEmailThreadMatch,
} from './email-threading.mts'
import {
  validateCopyrightEmailParseInput,
  isHumanCopyrightEmail,
  type CopyrightEmailParseInput,
} from './email-intake-parse-input.mts'
import {
  copyrightEmailReplyHeaders,
  decryptCopyrightEmailReplyHeaders,
  encryptCopyrightEmailReplyHeaders,
} from './email-thread-references.mts'
export type { CopyrightEmailParseInput } from './email-intake-parse-input.mts'

export async function recordCopyrightEmailParse(
  intake: CopyrightEmailIntake,
  input: CopyrightEmailParseInput,
): Promise<CopyrightEmailThreadMatch | null> {
  validateCopyrightEmailParseInput(input)
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  await using preparedKey = await prepareCopyrightIntakeEncryptionKey(intake.id)
  await using transaction = await beginTransaction()
  // Serialize parser receipt eligibility with staff decisions before inserting parse rows.
  const { rows: liveRows } = await transaction<{
    id: string
  }>(sql`/* recordCopyrightEmailParse:lock */
    SELECT id FROM copyright_notice_email_intakes
    WHERE id = ${intake.id} AND raw_storage_object_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
        WHERE receipt.id = ${intake.id} AND receipt.erased_at IS NULL)
    FOR UPDATE
  `)
  if (liveRows.length === 0) throw new ErasedCopyrightEmailIntakeReplay()
  if (preparedKey)
    await attachCopyrightEncryptionKey(preparedKey, { kind: 'intake', id: intake.id }, transaction)
  await using ownerScopes = await openCopyrightOwnerSecretBatch(
    [{ kind: 'intake', id: intake.id }],
    transaction,
  )
  const secrets = ownerScopes.get({ kind: 'intake', id: intake.id })
  const { encryptSecret, decryptSecret } = secrets
  const { rowCount } = await transaction(sql`/* recordCopyrightEmailParse */
    INSERT INTO copyright_notice_email_intake_parses (
      copyright_notice_email_intake_id, status, sender_email_ciphertext,
      sender_name_ciphertext, subject_ciphertext, body_ciphertext, message_id_ciphertext,
      reply_references_ciphertext, error_ciphertext
    ) VALUES (
      ${intake.id}, ${input.status},
      ${input.status === 'succeeded' ? encryptSecret(input.fromEmail, purpose) : null},
      ${input.status === 'succeeded' && input.fromName ? encryptSecret(input.fromName, purpose) : null},
      ${input.status === 'succeeded' ? encryptSecret(input.subject, purpose) : null},
      ${input.status === 'succeeded' ? encryptSecret(input.bodyText, purpose) : null},
      ${input.status === 'succeeded' && input.messageId ? encryptSecret(input.messageId, purpose) : null},
      ${input.status === 'succeeded' ? encryptCopyrightEmailReplyHeaders(copyrightEmailReplyHeaders(input), purpose, secrets) : null},
      ${input.status === 'failed' ? encryptSecret(input.error, purpose) : null}
    ) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
  `)
  const retainedThread = !rowCount
    ? (
        await transaction<{
          status: 'succeeded' | 'failed'
          message_id_ciphertext: string | null
          reply_references_ciphertext: string | null
        }>(sql`/* recordCopyrightEmailParse:retainedThread */
          SELECT status, message_id_ciphertext, reply_references_ciphertext
          FROM copyright_notice_email_intake_parses
          WHERE copyright_notice_email_intake_id = ${intake.id}
        `)
      ).rows[0]
    : null
  if (rowCount && input.status === 'succeeded' && input.attachments.length > 0) {
    await insertCopyrightEmailAttachments(
      transaction,
      intake.id,
      input.attachments,
      purpose,
      secrets,
    )
  }
  if (
    rowCount &&
    input.status === 'succeeded' &&
    isHumanCopyrightEmail(input) &&
    copyrightEmailReplyHeaders(input).inReplyTo.length === 0 &&
    copyrightEmailReplyHeaders(input).references.length === 0 &&
    isCopyrightIntakeEnabled()
  ) {
    const { rows: verdicts } =
      await transaction<CopyrightEmailSesVerdicts>(sql`/* recordCopyrightEmailParse:receiptEligibility */
      SELECT spf_verdict AS spf, dkim_verdict AS dkim, dmarc_verdict AS dmarc, spam_verdict AS spam, virus_verdict AS virus
      FROM copyright_notice_email_intakes WHERE id = ${intake.id}
        AND EXISTS (SELECT 1 FROM copyright_notice_email_intake_receipts receipt
          WHERE receipt.id = ${intake.id} AND receipt.review_decision IS NULL)
    `)
    if (verdicts[0] && isAuthenticatedCopyrightEmail(verdicts[0]))
      await createCopyrightEmailIntakeResponseInTransaction(
        {
          intakeId: intake.id,
          recipientEmail: input.fromEmail,
          responseKind: 'received',
          responseMessage: null,
        },
        transaction,
        ownerScopes,
      )
  }
  if ((rowCount ? input.status : retainedThread?.status) !== 'succeeded') {
    await transaction.commit()
    return null
  }
  const headers = retainedThread
    ? decryptCopyrightEmailReplyHeaders(
        retainedThread.reply_references_ciphertext,
        purpose,
        secrets,
      )
    : input.status === 'succeeded'
      ? copyrightEmailReplyHeaders(input)
      : null
  if (!headers) {
    await transaction.commit()
    return null
  }
  const messageId = retainedThread
    ? retainedThread.message_id_ciphertext
      ? decryptSecret(retainedThread.message_id_ciphertext, purpose)
      : null
    : input.status === 'succeeded'
      ? input.messageId
      : null
  await transaction.commit()
  return await recordCopyrightEmailThreadReferences({
    intakeId: intake.id,
    messageId,
    inReplyTo: headers.inReplyTo,
    references: headers.references,
  })
}
export { getCopyrightEmailIntakeForAgent } from './email-intake-agent-loader.mts'
