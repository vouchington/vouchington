import { insertCopyrightEmailAttachments } from './email-intake-attachments.mts'
import { beginTransaction } from '@data-stores/psql'
import { isCopyrightIntakeEnabled } from './activation.mts'
import { createCopyrightEmailIntakeResponseInTransaction } from './email-intake-reply.mts'
import {
  isAuthenticatedCopyrightEmail,
  type CopyrightEmailSesVerdicts,
} from './email-ses-verdicts.mts'
import { encryptSecret } from '@modules/token-secrets'
import assert from 'http-assert'
import sql from 'sql-template-strings'
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
      replyReferences: string[]
      attachments: CopyrightEmailAttachmentInput[]
    }
  | { status: 'failed'; error: string }

export async function recordCopyrightEmailParse(
  intake: CopyrightEmailIntake,
  input: CopyrightEmailParseInput,
): Promise<CopyrightEmailThreadMatch | null> {
  validateParseInput(input)
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
      ${
        input.status === 'succeeded' && input.replyReferences.length > 0
          ? encryptSecret(JSON.stringify(input.replyReferences), purpose)
          : null
      },
      ${input.status === 'failed' ? encryptSecret(input.error, purpose) : null}
    ) ON CONFLICT (copyright_notice_email_intake_id) DO NOTHING
  `)
  if (rowCount && input.status === 'succeeded' && input.attachments.length > 0) {
    await insertCopyrightEmailAttachments(transaction, intake.id, input.attachments, purpose)
  }
  if (
    rowCount &&
    input.status === 'succeeded' &&
    input.replyReferences.length === 0 &&
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
  if (input.status !== 'succeeded') return null
  return await recordCopyrightEmailThreadReferences({
    intakeId: intake.id,
    messageId: input.messageId,
    replyReferences: input.replyReferences,
  })
}
export async function getCopyrightEmailIntakeForAgent(
  intakeId: string,
): Promise<CopyrightEmailIntakeForAgent | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightEmailIntake & ParseCiphertexts>(
    sql`/* getCopyrightEmailIntakeForAgent */
      SELECT intake.id, intake.amazon_ses_message_id, intake.received_at, intake.raw_storage_key,
        intake.raw_sha256, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type, intake.raw_byte_size,
        parse.sender_email_ciphertext, parse.sender_name_ciphertext,
        parse.subject_ciphertext, parse.body_ciphertext
      FROM copyright_notice_email_intakes intake
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

function validateParseInput(input: CopyrightEmailParseInput): void {
  if (input.status === 'failed') {
    assert(input.error.length > 0 && input.error.length <= 10_000, 422, 'Invalid parser failure')
    return
  }
  assert(input.fromEmail.trim().length > 0 && input.fromEmail.length <= 320, 422, 'Invalid sender')
  assert(!input.fromName || input.fromName.length <= 500, 422, 'Invalid sender name')
  assert(input.subject.length > 0 && input.subject.length <= 10_000, 422, 'Invalid subject')
  assert(input.bodyText.length > 0 && input.bodyText.length <= 2_000_000, 422, 'Invalid body')
  assert(!input.messageId || input.messageId.length <= 10_000, 422, 'Invalid Message-ID')
  assert(
    input.replyReferences.length <= 100 &&
      input.replyReferences.every(reference => reference.length > 0 && reference.length <= 10_000),
    422,
    'Invalid reply references',
  )
  assert(input.attachments.length <= 100, 422, 'Too many attachments')
  assert(
    input.attachments.every(
      attachment =>
        attachment.sha256.length === 32 &&
        Number.isSafeInteger(attachment.byteSize) &&
        attachment.byteSize >= 0 &&
        attachment.mimeType.length > 0 &&
        attachment.mimeType.length <= 255 &&
        (!attachment.filename || attachment.filename.length <= 1024) &&
        (!attachment.contentId || attachment.contentId.length <= 1024),
    ),
    422,
    'Invalid attachment metadata',
  )
}
