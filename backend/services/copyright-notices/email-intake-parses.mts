import { insertCopyrightEmailAttachments } from './email-intake-attachments.mts'
import { beginTransaction } from '@data-stores/psql'
import { isCopyrightIntakeEnabled } from './activation.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from './email-intake-reply.mts'
import {
  isAuthenticatedCopyrightEmail,
  type CopyrightEmailSesVerdicts,
} from './email-ses-verdicts.mts'
import { decryptSecret, encryptSecret } from '@modules/token-secrets'
import sql from 'sql-template-strings'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './retention-erasure-spec.mts'
import {
  copyrightEmailIntakePurpose,
  type CopyrightEmailAttachmentInput,
  type CopyrightEmailIntake,
  type CopyrightEmailIntakeForAgent,
} from './email-intakes.mts'
import {
  recordCopyrightEmailThreadReferences,
  type CopyrightEmailThreadMatch,
} from './email-threading.mts'
import { validateCopyrightEmailParseInput } from './email-intake-parse-input.mts'
import {
  copyrightEmailReplyHeaders,
  decryptCopyrightEmailReplyHeaders,
  encryptCopyrightEmailReplyHeaders,
} from './email-thread-references.mts'
import {
  decryptAgentIntake,
  type AttachmentCiphertexts,
  type ParseCiphertexts,
} from './email-intake-agent.mts'
export type CopyrightEmailParseInput =
  | {
      status: 'succeeded'
      fromEmail: string
      fromName?: string
      subject: string
      bodyText: string
      messageId: string | null
      inReplyTo?: string[]
      replyReferences: string[]
      attachments: CopyrightEmailAttachmentInput[]
    }
  | { status: 'failed'; error: string }

export async function recordCopyrightEmailParse(
  intake: CopyrightEmailIntake,
  input: CopyrightEmailParseInput,
): Promise<CopyrightEmailThreadMatch | null> {
  validateCopyrightEmailParseInput(input)
  const purpose = copyrightEmailIntakePurpose(intake.amazon_ses_message_id)
  await using transaction = await beginTransaction()
  // Serialize parser receipt eligibility with staff decisions before inserting parse rows.
  await transaction(sql`/* recordCopyrightEmailParse:lock */
    SELECT id FROM copyright_notice_email_intakes WHERE id = ${intake.id} FOR UPDATE
  `)
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
      ${input.status === 'succeeded' ? encryptCopyrightEmailReplyHeaders(copyrightEmailReplyHeaders(input), purpose) : null},
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
    await insertCopyrightEmailAttachments(transaction, intake.id, input.attachments, purpose)
  }
  if (
    rowCount &&
    input.status === 'succeeded' &&
    copyrightEmailReplyHeaders(input).inReplyTo.length === 0 &&
    copyrightEmailReplyHeaders(input).references.length === 0 &&
    isCopyrightIntakeEnabled()
  ) {
    const { rows: verdicts } =
      await transaction<CopyrightEmailSesVerdicts>(sql`/* recordCopyrightEmailParse:receiptEligibility */
      SELECT spf_verdict AS spf, dkim_verdict AS dkim, dmarc_verdict AS dmarc, spam_verdict AS spam, virus_verdict AS virus
      FROM copyright_notice_email_intakes WHERE id = ${intake.id}
        AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_reviews
          WHERE copyright_notice_email_intake_id = ${intake.id})
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
      )
  }
  await transaction.commit()
  if (!rowCount && retainedThread?.status !== 'succeeded') return null
  if (rowCount && input.status !== 'succeeded') return null
  const headers = retainedThread
    ? decryptCopyrightEmailReplyHeaders(retainedThread.reply_references_ciphertext, purpose)
    : input.status === 'succeeded'
      ? copyrightEmailReplyHeaders(input)
      : null
  if (!headers) return null
  return await recordCopyrightEmailThreadReferences({
    intakeId: intake.id,
    messageId: retainedThread
      ? retainedThread.message_id_ciphertext
        ? decryptSecret(retainedThread.message_id_ciphertext, purpose)
        : null
      : input.status === 'succeeded'
        ? input.messageId
        : null,
    inReplyTo: headers.inReplyTo,
    references: headers.references,
  })
}
export async function getCopyrightEmailIntakeForAgent(
  intakeId: string,
): Promise<CopyrightEmailIntakeForAgent | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightEmailIntake & ParseCiphertexts>(
    sql`/* getCopyrightEmailIntakeForAgent */
      SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
        COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
        intake.raw_storage_object_id, intake.raw_sha256, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size,
        parse.sender_email_ciphertext, parse.sender_name_ciphertext,
        parse.subject_ciphertext, parse.body_ciphertext
      FROM copyright_notice_email_intakes intake
      LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
      JOIN copyright_notice_email_intake_parses parse
        ON parse.copyright_notice_email_intake_id = intake.id AND parse.status = 'succeeded'
      WHERE intake.id = ${intakeId} LIMIT 1`,
  )
  const intake = rows[0]
  if (!intake) {
    await transaction.commit()
    return null
  }
  const { rows: attachments } = await transaction<AttachmentCiphertexts>(
    sql`/* getCopyrightEmailIntakeForAgent:attachments */
      SELECT filename_ciphertext, content_id_ciphertext,
        (SELECT mime_type FROM media_types WHERE id = media_type_id) AS mime_type, byte_size, sha256
      FROM copyright_notice_email_intake_attachments
      WHERE copyright_notice_email_intake_id = ${intake.id} ORDER BY ordinal`,
  )
  await transaction.commit()
  return decryptAgentIntake(intake, attachments)
}
