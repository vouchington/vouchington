import { Readable } from 'node:stream'
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3'
import { read } from '@data-stores/psql'
import { decryptSecret } from '@modules/token-secrets'
import { copyrightEmailIntakePurpose } from '../services/copyright-notices/email-intakes.mts'
import { decryptCopyrightEmailReplyHeaders } from '../services/copyright-notices/email-thread-references.mts'
import sql from 'sql-template-strings'
import { onTestFinished, vi } from 'vitest'

type ListPage = { keys: string[]; next?: string }

export type SesInboundS3Call = { command: string; input: Record<string, unknown> }

export const SES_INBOUND_TEST_RECEIVED_AT = new Date('2026-07-01T12:00:00.000Z')

/**
 * The SES inbound bucket behind the shared S3 client: `GetObject` answers with a fresh stream of
 * the stored raw message (or its `getError`), `ListObjectsV2` answers the page for the request's
 * continuation token, and copies and deletes succeed. Every call is recorded in order. The test
 * sets `S3_BUCKET_SES_INBOUND` itself.
 */
export function stubSesInboundS3ForTest(
  options: {
    objects?: Record<string, string>
    listPages?: Record<string, ListPage>
    getError?: Error
    getWithoutBody?: boolean
  } = {},
): SesInboundS3Call[] {
  const calls: SesInboundS3Call[] = []
  const spy = vi.spyOn(S3Client.prototype, 'send').mockImplementation((async (command: unknown) => {
    const { input } = command as { input: Record<string, unknown> }
    calls.push({ command: (command as object).constructor.name, input })
    if (command instanceof GetObjectCommand) {
      if (options.getError) throw options.getError
      const raw = Buffer.from(options.objects?.[input.Key as string] ?? '')
      return {
        ...(options.getWithoutBody ? {} : { Body: Readable.from([raw]) }),
        ContentLength: raw.length,
        LastModified: SES_INBOUND_TEST_RECEIVED_AT,
        ETag: '"etag-1"',
        VersionId: 'version-1',
      }
    }
    if (command instanceof ListObjectsV2Command) {
      const page = options.listPages?.[(input.ContinuationToken as string | undefined) ?? '']
      if (!page) throw new Error('Unexpected SES inbound listing page')
      return {
        Contents: page.keys.map(Key => ({ Key })),
        ...(page.next ? { NextContinuationToken: page.next } : {}),
      }
    }
    if (command instanceof CopyObjectCommand || command instanceof DeleteObjectCommand) return {}
    throw new Error('Unexpected S3 command in the SES inbound processor')
  }) as never)
  onTestFinished(() => spy.mockRestore())
  return calls
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
