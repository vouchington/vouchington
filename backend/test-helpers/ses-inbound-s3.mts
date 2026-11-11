import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { decryptCopyrightEmailReplyHeaders } from '../services/copyright-notices/email-thread-references.mts'
import sql from 'sql-template-strings'
import { afterEach, beforeEach, vi } from 'vitest'
import { createTestS3Bucket, emulatorS3 } from './aws-emulator-s3.mts'

/**
 * A fresh versioned AWS Emulator bucket per test, named by `S3_BUCKET_SES_INBOUND`, standing in for
 * the bucket SES writes received mail into.
 */
export function useSesInboundBucket(): { name(): string } {
  let bucket: string | undefined
  beforeEach(async () => {
    bucket = await createTestS3Bucket('ses-inbound', { versioned: true })
    vi.stubEnv('S3_BUCKET_SES_INBOUND', bucket)
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })
  return {
    name() {
      if (!bucket) throw new Error('The SES inbound bucket exists only inside a test')
      return bucket
    },
  }
}

/** The time S3 recorded for a stored object, which the processor keeps as the receipt time. */
export async function readS3ObjectLastModifiedForTest(Bucket: string, Key: string): Promise<Date> {
  const { LastModified } = await emulatorS3().send(new HeadObjectCommand({ Bucket, Key }))
  if (!LastModified) throw new Error(`S3 object ${Key} has no LastModified`)
  return LastModified
}

/** The intake the processor created for an SES message, or undefined when none was stored. */
export async function readCopyrightEmailIntakeIdForTest(
  sesMessageId: string,
): Promise<string | undefined> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightEmailIntakeIdForTest */
    SELECT id FROM copyright_notice_email_intakes WHERE amazon_ses_message_id = ${sesMessageId}`)
  return rows[0]?.id
}

/** The SES verdict columns stored on an intake. */
export async function readCopyrightEmailIntakeVerdictsForTest(intakeId: string) {
  const { rows } = await read<{
    spf: string
    dkim: string
    dmarc: string
    spam: string
    virus: string
  }>(sql`/* readCopyrightEmailIntakeVerdictsForTest */
    SELECT spf_verdict AS spf, dkim_verdict AS dkim, dmarc_verdict AS dmarc,
      spam_verdict AS spam, virus_verdict AS virus
    FROM copyright_notice_email_intakes WHERE id = ${intakeId}`)
  return rows[0]
}

/** The decrypted failure text recorded for an intake whose original email could not be parsed. */
export async function readCopyrightEmailParseFailureForTest(
  intakeId: string,
  sesMessageId: string,
): Promise<string | null> {
  const { rows } = await read<{ status: string; error_ciphertext: string | null }>(sql`
    /* readCopyrightEmailParseFailureForTest */
    SELECT status, error_ciphertext FROM copyright_notice_email_intake_parses
    WHERE copyright_notice_email_intake_id = ${intakeId}`)
  const row = rows[0]
  if (row?.status !== 'failed' || !row.error_ciphertext) return null
  return decryptSecret(row.error_ciphertext, copyrightEmailIntakePurpose(sesMessageId))
}

/** The Message-ID, In-Reply-To and References the parse stored (encrypted at rest) for an intake. */
export async function readCopyrightEmailThreadHeadersForTest(
  intakeId: string,
  sesMessageId: string,
): Promise<{ messageId: string | null; inReplyTo: string[]; references: string[] }> {
  const { rows } = await read<{
    message_id_ciphertext: string | null
    reply_references_ciphertext: string | null
  }>(sql`/* readCopyrightEmailThreadHeadersForTest */
    SELECT message_id_ciphertext, reply_references_ciphertext
    FROM copyright_notice_email_intake_parses
    WHERE copyright_notice_email_intake_id = ${intakeId} AND status = 'succeeded'`)
  const purpose = copyrightEmailIntakePurpose(sesMessageId)
  const row = rows[0]!
  const reply = decryptCopyrightEmailReplyHeaders(row.reply_references_ciphertext, purpose)
  return {
    messageId: row.message_id_ciphertext ? decryptSecret(row.message_id_ciphertext, purpose) : null,
    inReplyTo: reply.inReplyTo,
    references: reply.references,
  }
}

/** The reference kind by which `replyIntakeId` resolved `ancestorIntakeId` as a thread ancestor. */
export async function readCopyrightEmailAncestorKindForTest(
  replyIntakeId: string,
  ancestorIntakeId: string,
): Promise<string | undefined> {
  const { rows } = await read<{ reference_kind: string }>(sql`
    /* readCopyrightEmailAncestorKindForTest */
    SELECT reference_kind FROM copyright_notice_email_message_ancestors
    WHERE reply_message_intake_receipt_id = ${replyIntakeId}
      AND ancestor_message_intake_receipt_id = ${ancestorIntakeId}`)
  return rows[0]?.reference_kind
}
