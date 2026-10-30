import { createHash } from 'node:crypto'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { S3ImagesClient } from '@modules/aws'
import { createCodedError } from '@vouchington/sentry'
import { COPYRIGHT_EMAIL_QUARANTINED } from '@modules/on-error/error-codes'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'
import type { CopyrightEmailSesVerdict } from './email-ses-verdicts.mts'

export type CopyrightEmailRawEvidence = {
  bytes: Buffer
  mimeType: string
  sha256: string
}

type RawEvidenceRecord = {
  raw_storage_key: string | null
  raw_mime_type: string
  raw_byte_size: number
  raw_sha256: Buffer
  virus_verdict: CopyrightEmailSesVerdict
}

export async function loadCopyrightEmailRawEvidence(
  intakeId: string,
  currentUser: PrivateUser,
): Promise<CopyrightEmailRawEvidence | null> {
  if (!currentUserCanReviewCopyrightNotices(currentUser)) return null
  await using transaction = await beginTransaction()
  if (!(await lockCopyrightRawEvidenceCase(transaction, intakeId))) return null
  await transaction(sql`/* lockCopyrightRawEvidenceIntake */ SELECT id FROM copyright_notice_email_intakes
    WHERE id = ${intakeId} FOR SHARE`)
  if (!(await lockCopyrightRawEvidenceCase(transaction, intakeId))) return null
  await transaction(sql`/* lockCopyrightRawEvidenceObject */ SELECT object.id FROM copyright_notice_storage_objects object
    JOIN copyright_notice_email_intakes intake ON intake.raw_storage_object_id = object.id
    WHERE intake.id = ${intakeId} FOR SHARE OF object`)
  const record = await getRawEvidenceRecord(intakeId, transaction)
  // An erased intake no longer owns an object, so there is nothing to fetch.
  if (!record?.raw_storage_key) return null
  // The stored object is the sender's unmodified message. Refuse every non-pass verdict before
  // reading it, so detected malware and uncleared originals never leave the private evidence bucket.
  if (record.virus_verdict !== 'pass') {
    throw createCodedError(
      409,
      'The original email is quarantined because SES did not report a passing virus scan. Review the parsed text only.',
      COPYRIGHT_EMAIL_QUARANTINED,
    )
  }
  const bucket = process.env.S3_BUCKET_COPYRIGHT_EVIDENCE?.trim()
  if (!bucket) throw new Error('S3_BUCKET_COPYRIGHT_EVIDENCE is required')
  const response = await S3ImagesClient.send(
    new GetObjectCommand({ Bucket: bucket, Key: record.raw_storage_key }),
  )
  if (!response.Body) throw new Error('Copyright email evidence object has no body')
  if (response.ContentLength !== undefined && response.ContentLength !== record.raw_byte_size) {
    throw new Error('Copyright email evidence size does not match its immutable receipt')
  }
  const bytes = await readExactBytes(
    response.Body as AsyncIterable<Uint8Array>,
    record.raw_byte_size,
  )
  const sha256 = createHash('sha256').update(bytes).digest()
  if (!sha256.equals(record.raw_sha256)) {
    throw new Error('Copyright email evidence digest does not match its immutable receipt')
  }
  await transaction.commit()
  return { bytes, mimeType: record.raw_mime_type, sha256: sha256.toString('hex') }
}

/** A link can commit during the intake lock wait; invoke before and after that lock. */
async function lockCopyrightRawEvidenceCase(
  query: TransactionQuery,
  intakeId: string,
): Promise<boolean> {
  const { rows } = await query<{ locked: boolean }>(sql`/* lockCopyrightRawEvidenceCase */
    SELECT pg_try_advisory_xact_lock_shared(hashtextextended('copyright-erasure:' || link.copyright_notice_id::text, 0)) AS locked
    FROM copyright_notice_email_intake_notice_links link WHERE link.copyright_notice_email_intake_receipt_id = ${intakeId}`)
  return !rows[0] || rows[0].locked
}

async function getRawEvidenceRecord(
  intakeId: string,
  transaction: TransactionQuery,
): Promise<RawEvidenceRecord | null> {
  const { rows } = await transaction<RawEvidenceRecord>(sql`/* getCopyrightEmailRawEvidence */
    SELECT object.storage_key AS raw_storage_key,
      (SELECT mime_type FROM media_types WHERE id = intake.raw_media_type_id) AS raw_mime_type,
      intake.raw_byte_size, intake.raw_sha256, intake.virus_verdict
    FROM copyright_notice_email_intakes intake
    JOIN copyright_notice_email_intake_receipts receipt
      ON receipt.id = intake.id AND receipt.erased_at IS NULL
    LEFT JOIN copyright_notice_storage_objects object ON object.id = intake.raw_storage_object_id
    WHERE intake.id = ${intakeId} AND object.erased_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM copyright_notice_email_intake_notice_links link
        JOIN copyright_notice_minimal_purge_continuations work ON work.copyright_notice_identity_id = link.copyright_notice_id
        WHERE link.copyright_notice_email_intake_receipt_id = intake.id AND work.erasure_started_at IS NOT NULL)
  `)
  return rows[0] ?? null
}

async function readExactBytes(
  body: AsyncIterable<Uint8Array>,
  expectedSize: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  let byteSize = 0
  for await (const chunk of body) {
    const bytes = Buffer.from(chunk)
    byteSize += bytes.byteLength
    if (byteSize > expectedSize) {
      throw new Error('Copyright email evidence exceeds its immutable receipt size')
    }
    chunks.push(bytes)
  }
  if (byteSize !== expectedSize) {
    throw new Error('Copyright email evidence size does not match its immutable receipt')
  }
  return Buffer.concat(chunks, byteSize)
}
