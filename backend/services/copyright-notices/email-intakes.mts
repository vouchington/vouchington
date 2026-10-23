import { upsertMediaTypes } from '@services/urls/media-types'
import { beginBoundedTransaction, beginTransaction, type TransactionQuery } from '@data-stores/psql'
import assert from 'http-assert'
import sql from 'sql-template-strings'
import type { CopyrightEmailSesVerdicts } from './email-ses-verdicts.mts'
import { COPYRIGHT_ERASED_KEY_PREFIX } from './retention-erasure-spec.mts'
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

export type CreateCopyrightEmailIntakeInput = {
  sesMessageId: string
  receivedAt: Date
  rawStorageKey: string
  rawSha256: Buffer
  rawMimeType: string
  rawByteSize: number
  sesVerdicts: CopyrightEmailSesVerdicts
}

/** Validate a provider replay after the original MIME and intake have expired. */
export function assertCopyrightEmailRetainedDigest(
  erased: { raw_sha256: Buffer; raw_byte_size: number },
  raw: { sha256: Buffer; byteSize: number },
): void {
  assert(
    erased.raw_sha256.equals(raw.sha256) && erased.raw_byte_size === raw.byteSize,
    409,
    'SES message ID was reused for different copyright evidence',
  )
}

export async function createCopyrightEmailIntake(
  input: CreateCopyrightEmailIntakeInput,
  existingTransaction?: TransactionQuery,
): Promise<{ intake: CopyrightEmailIntake; isNew: boolean }> {
  if (existingTransaction)
    return createCopyrightEmailIntakeInTransaction(input, existingTransaction)
  await using transaction = await beginTransaction()
  const result = await createCopyrightEmailIntakeInTransaction(input, transaction)
  await transaction.commit()
  return result
}

export async function withCopyrightEmailIntakeIdentityLock<T>(
  sesMessageId: string,
  effect: (
    transaction: TransactionQuery,
    erased: { raw_sha256: Buffer; raw_byte_size: number } | null,
  ) => Promise<T>,
): Promise<T> {
  await using transaction = await beginBoundedTransaction({
    connectionTimeoutMs: 5_000,
    statementTimeoutMs: 20_000,
  })
  await transaction(sql`/* setCopyrightEmailIngressTimeouts */
    SELECT set_config('lock_timeout', '5s', true),
      set_config('idle_in_transaction_session_timeout', '120s', true)`)
  await transaction(sql`/* lockCopyrightEmailIntakeIdentity */
    SELECT pg_advisory_xact_lock(hashtextextended(${`copyright-email:${sesMessageId}`}, 0))`)
  const { rows } = await transaction<{ raw_sha256: Buffer; raw_byte_size: number }>(sql`
    /* getErasedCopyrightEmailIdentity */
    SELECT raw_sha256, raw_byte_size FROM copyright_notice_email_retained_identities
    WHERE amazon_ses_message_id = ${sesMessageId}`)
  const result = await effect(transaction, rows[0] ?? null)
  await transaction.commit()
  return result
}

export async function createCopyrightEmailIntakeInTransaction(
  input: CreateCopyrightEmailIntakeInput,
  transaction: TransactionQuery,
): Promise<{ intake: CopyrightEmailIntake; isNew: boolean }> {
  assert(input.rawSha256.length === 32, 422, 'Raw email SHA-256 must be 32 bytes')
  assert(
    Number.isSafeInteger(input.rawByteSize) && input.rawByteSize >= 0,
    422,
    'Invalid raw email size',
  )
  const rawMediaTypeId = await upsertMediaTypes(input.rawMimeType, { query: transaction })
  const rawStorageObjectId = await upsertCopyrightStorageObjectId(input.rawStorageKey, transaction)
  const { sesVerdicts } = input
  const { rows } = await transaction<CopyrightEmailIntake>(sql`/* createCopyrightEmailIntake */
    INSERT INTO copyright_notice_email_intakes (
      amazon_ses_message_id, received_at, raw_storage_object_id, raw_sha256, raw_media_type_id, raw_byte_size,
      spf_verdict, dkim_verdict, dmarc_verdict, spam_verdict, virus_verdict
    ) VALUES (
      ${input.sesMessageId}, ${input.receivedAt}, ${rawStorageObjectId}, ${input.rawSha256},
      ${rawMediaTypeId}, ${input.rawByteSize},
      ${sesVerdicts.spf}, ${sesVerdicts.dkim}, ${sesVerdicts.dmarc}, ${sesVerdicts.spam},
      ${sesVerdicts.virus}
    ) ON CONFLICT (amazon_ses_message_id) DO NOTHING
    RETURNING id, amazon_ses_message_id, received_at, ${input.rawStorageKey}::text AS raw_storage_key,
      raw_storage_object_id, raw_sha256, raw_media_type_id,
      (SELECT mime_type FROM media_types WHERE id = raw_media_type_id) AS raw_mime_type, raw_byte_size
  `)
  const intake = rows[0]
  if (intake) {
    return { intake, isNew: true }
  }
  const { rows: existingRows } = await transaction<CopyrightEmailIntake>(
    sql`/* createCopyrightEmailIntake:existing */
      SELECT intake.id, intake.amazon_ses_message_id, intake.received_at,
        COALESCE(object.storage_key, ${COPYRIGHT_ERASED_KEY_PREFIX} || intake.id::text) AS raw_storage_key,
        intake.raw_storage_object_id, intake.raw_sha256, intake.raw_media_type_id,
        (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type,
        intake.raw_byte_size
      FROM copyright_notice_email_intakes intake
      LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
      WHERE intake.amazon_ses_message_id = ${input.sesMessageId}`,
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
  return { intake: existing, isNew: false }
}

export function copyrightEmailIntakePurpose(sesMessageId: string): string {
  return `copyright-email-intake:${sesMessageId}`
}
