import { beginTransaction } from '@data-stores/psql'
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
  const purpose = copyrightEmailIntakePurpose(intake.ses_message_id)
  await using transaction = await beginTransaction()
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
    await insertAttachments(transaction, intake.id, input.attachments, purpose)
  }
  await transaction.commit()
  if (input.status !== 'succeeded') return null
  return recordCopyrightEmailThreadReferences({
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
      SELECT intake.id, intake.ses_message_id, intake.received_at, intake.raw_storage_key,
        intake.raw_sha256, intake.raw_mime_type, intake.raw_byte_size,
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
      SELECT filename_ciphertext, content_id_ciphertext, mime_type, byte_size, sha256
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
async function insertAttachments(
  transaction: Awaited<ReturnType<typeof beginTransaction>>,
  intakeId: string,
  attachments: CopyrightEmailAttachmentInput[],
  purpose: string,
): Promise<void> {
  const rows = JSON.stringify(
    attachments.map((attachment, ordinal) => ({
      ordinal,
      filename_ciphertext: attachment.filename ? encryptSecret(attachment.filename, purpose) : null,
      content_id_ciphertext: attachment.contentId
        ? encryptSecret(attachment.contentId, purpose)
        : null,
      mime_type: attachment.mimeType,
      byte_size: attachment.byteSize,
      sha256: attachment.sha256.toString('hex'),
    })),
  )
  await transaction(sql`/* recordCopyrightEmailParse:attachments */
    INSERT INTO copyright_notice_email_intake_attachments (
      copyright_notice_email_intake_id, ordinal, filename_ciphertext, content_id_ciphertext,
      mime_type, byte_size, sha256
    ) SELECT ${intakeId}, attachment.ordinal, attachment.filename_ciphertext,
      attachment.content_id_ciphertext, attachment.mime_type, attachment.byte_size,
      decode(attachment.sha256, 'hex')
    FROM jsonb_to_recordset(${rows}::jsonb) AS attachment(
      ordinal integer, filename_ciphertext text, content_id_ciphertext text, mime_type text,
      byte_size integer, sha256 text
    )
  `)
}
