import { createHash } from 'node:crypto'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { beginTransaction } from '@data-stores/psql'
import { S3ImagesClient } from '@modules/aws'
import sql from 'sql-template-strings'
import type { PrivateUser } from '@services/users/types'
import { currentUserCanReviewCopyrightNotices } from './authorization.mts'

export type CopyrightEmailRawEvidence = {
  bytes: Buffer
  mimeType: string
  sha256: string
}

type RawEvidenceRecord = {
  raw_storage_key: string
  raw_mime_type: string
  raw_byte_size: number
  raw_sha256: Buffer
}

export async function loadCopyrightEmailRawEvidence(
  intakeId: string,
  currentUser: PrivateUser,
): Promise<CopyrightEmailRawEvidence | null> {
  if (!currentUserCanReviewCopyrightNotices(currentUser)) return null
  const record = await getRawEvidenceRecord(intakeId)
  if (!record) return null
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
  return { bytes, mimeType: record.raw_mime_type, sha256: sha256.toString('hex') }
}

async function getRawEvidenceRecord(intakeId: string): Promise<RawEvidenceRecord | null> {
  await using transaction = await beginTransaction()
  const { rows } = await transaction<RawEvidenceRecord>(sql`/* getCopyrightEmailRawEvidence */
    SELECT raw_storage_key, raw_mime_type, raw_byte_size, raw_sha256
    FROM copyright_notice_email_intakes
    WHERE id = ${intakeId}
  `)
  await transaction.commit()
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
