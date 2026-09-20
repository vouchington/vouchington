import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'

export type CopyrightEmailAttachmentInput = {
  filename: string | null
  contentId: string | null
  mimeType: string
  byteSize: number
  sha256: Buffer
}

export type CopyrightEmailIntake = {
  id: string
  ses_message_id: string
  received_at: Date
  raw_storage_key: string
  raw_sha256: Buffer
  raw_mime_type: string
  raw_byte_size: number
}

export type CopyrightEmailIntakeForAgent = CopyrightEmailIntake & {
  senderEmail: string
  senderName: string | null
  subject: string
  bodyText: string
  attachments: CopyrightEmailAttachmentInput[]
}

export async function createCopyrightEmailIntake(input: {
  sesMessageId: string
  receivedAt: Date
  rawStorageKey: string
  rawSha256: Buffer
  rawMimeType: string
  rawByteSize: number
}): Promise<{ intake: CopyrightEmailIntake; isNew: boolean }> {
  assert(input.rawSha256.length === 32, 422, 'Raw email SHA-256 must be 32 bytes')
  assert(
    Number.isSafeInteger(input.rawByteSize) && input.rawByteSize >= 0,
    422,
    'Invalid raw email size',
  )
  await using transaction = await beginTransaction()
  const { rows } = await transaction<CopyrightEmailIntake>(sql`/* createCopyrightEmailIntake */
    INSERT INTO copyright_notice_email_intakes (
      ses_message_id, received_at, raw_storage_key, raw_sha256, raw_mime_type, raw_byte_size
    ) VALUES (
      ${input.sesMessageId}, ${input.receivedAt}, ${input.rawStorageKey}, ${input.rawSha256},
      ${input.rawMimeType}, ${input.rawByteSize}
    ) ON CONFLICT (ses_message_id) DO NOTHING
    RETURNING id, ses_message_id, received_at, raw_storage_key, raw_sha256, raw_mime_type, raw_byte_size
  `)
  const intake = rows[0]
  if (intake) {
    await transaction.commit()
    return { intake, isNew: true }
  }
  const { rows: existingRows } = await transaction<CopyrightEmailIntake>(
    sql`/* createCopyrightEmailIntake:existing */
      SELECT id, ses_message_id, received_at, raw_storage_key, raw_sha256, raw_mime_type, raw_byte_size
      FROM copyright_notice_email_intakes WHERE ses_message_id = ${input.sesMessageId}`,
  )
  const existing = existingRows[0]
  assert(existing, 500, 'Copyright email intake conflict has no stored intake')
  assert(
    existing.raw_sha256.equals(input.rawSha256) &&
      existing.raw_byte_size === input.rawByteSize &&
      existing.raw_storage_key === input.rawStorageKey,
    409,
    'SES message ID was reused for different copyright evidence',
  )
  await transaction.commit()
  return { intake: existing, isNew: false }
}

export function copyrightEmailIntakePurpose(sesMessageId: string): string {
  return `copyright-email-intake:${sesMessageId}`
}
