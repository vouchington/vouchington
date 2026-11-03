import { createHash } from 'node:crypto'
import { upsertMediaTypes } from '@services/urls/media-types'
import { beginTransaction } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightEmailSesVerdicts } from './email-ses-verdicts.mts'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './email-erased-key.mts'
import { upsertCopyrightStorageObjectId } from './storage-objects.mts'

export type CopyrightEmailAttachmentInput = {
  filename: string | null
  contentId: string | null
  mimeType: string
  byteSize: number
  sha256: Buffer
}

export type CopyrightEmailIntake = {
  id: string
  amazon_ses_message_id: string
  received_at: Date
  raw_storage_key: string
  raw_storage_object_id: string | null
  raw_sha256: Buffer
  raw_media_type_id: string
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

/** A replay of an erased intake is complete, but cannot recreate private evidence or staff work. */
export class ErasedCopyrightEmailIntakeReplay extends Error {}

export async function createCopyrightEmailIntake(input: {
  sesMessageId: string
  receivedAt: Date
  rawStorageKey: string
  rawSha256: Buffer
  rawMimeType: string
  rawByteSize: number
  sesVerdicts: CopyrightEmailSesVerdicts
  preserveRawEvidence?: () => Promise<string>
}): Promise<{ intake: CopyrightEmailIntake; isNew: boolean }> {
  assert(input.rawSha256.length === 32, 422, 'Raw email SHA-256 must be 32 bytes')
  assert(
    Number.isSafeInteger(input.rawByteSize) && input.rawByteSize >= 0,
    422,
    'Invalid raw email size',
  )
  await using transaction = await beginTransaction()
  const storageKeySha256 = createHash('sha256').update(input.rawStorageKey).digest()
  const { rows: insertedReceipts } = await transaction<{
    id: string
  }>(sql`/* reserveCopyrightEmailIntakeReceipt */
    INSERT INTO copyright_notice_email_intake_receipts
      (amazon_ses_message_id, raw_sha256, raw_storage_key_sha256, raw_byte_size)
    VALUES (${input.sesMessageId}, ${input.rawSha256}, ${storageKeySha256}, ${input.rawByteSize})
    ON CONFLICT (amazon_ses_message_id) DO NOTHING RETURNING id`)
  const { rows: receiptRows } = await transaction<{
    id: string
    erased_at: Date | null
    raw_sha256: Buffer
    raw_storage_key_sha256: Buffer
    raw_byte_size: number
  }>(sql`/* lockCopyrightEmailIntakeReceipt */
    SELECT id, erased_at, raw_sha256, raw_storage_key_sha256, raw_byte_size
    FROM copyright_notice_email_intake_receipts
    WHERE amazon_ses_message_id = ${input.sesMessageId} FOR UPDATE`)
  const receipt = receiptRows[0]
  assert(receipt, 500, 'Copyright email intake receipt conflict has no stored identity')
  if (receipt.erased_at) throw new ErasedCopyrightEmailIntakeReplay()
  assert(
    receipt.raw_sha256.equals(input.rawSha256) &&
      receipt.raw_storage_key_sha256.equals(storageKeySha256) &&
      receipt.raw_byte_size === input.rawByteSize,
    409,
    'SES message ID was reused for different copyright evidence',
  )
  if (insertedReceipts.length === 0) {
    const { rows: existingRows } = await transaction<CopyrightEmailIntake>(
      sql`/* createCopyrightEmailIntake:existing */
        SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
          COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
          intake.raw_storage_object_id, intake.raw_sha256, intake.raw_media_type_id,
          (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type,
          intake.raw_byte_size
        FROM copyright_notice_email_intakes intake
        LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
        WHERE intake.id = ${receipt.id}`,
    )
    const existing = existingRows[0]
    if (!existing || existing.raw_storage_object_id === null) {
      throw new ErasedCopyrightEmailIntakeReplay()
    }
    assert(
      existing.raw_storage_key === input.rawStorageKey,
      409,
      'SES message ID was reused for different copyright evidence',
    )
    await transaction.commit()
    return { intake: existing, isNew: false }
  }
  // Reserve and lock the canonical key before copying bytes so an in-flight purge cannot
  // claim the same object between the upload and the intake reference.
  const rawStorageObjectId = await upsertCopyrightStorageObjectId(input.rawStorageKey, transaction)
  if (input.preserveRawEvidence) {
    const copiedKey = await input.preserveRawEvidence()
    assert(
      copiedKey === input.rawStorageKey,
      500,
      'Copyright evidence copy returned a different key',
    )
  }
  const rawMediaTypeId = await upsertMediaTypes(input.rawMimeType, { query: transaction })
  const { sesVerdicts } = input
  const { rows } = await transaction<CopyrightEmailIntake>(sql`/* createCopyrightEmailIntake */
    INSERT INTO copyright_notice_email_intakes (
      id, amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256, raw_media_type_id, raw_byte_size,
      spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict
    ) VALUES (
      ${receipt.id}, ${input.sesMessageId}, ${input.receivedAt}, ${rawStorageObjectId}, ${input.rawSha256},
      ${rawMediaTypeId}, ${input.rawByteSize},
      ${sesVerdicts.spf}, ${sesVerdicts.dkim}, ${sesVerdicts.dmarc}, ${sesVerdicts.spam},
      ${sesVerdicts.virus}
    )
    RETURNING id, amazon_ses_message_id, received_at, ${input.rawStorageKey}::text AS raw_storage_key,
      raw_storage_object_id, raw_sha256, raw_media_type_id,
      (SELECT mime_type FROM media_types WHERE id = raw_media_type_id) AS raw_mime_type, raw_byte_size
  `)
  await transaction.commit()
  return { intake: rows[0]!, isNew: true }
}

export function copyrightEmailIntakePurpose(sesMessageId: string): string {
  return `copyright-email-intake:${sesMessageId}`
}
