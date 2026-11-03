import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { ai_agents } from '@queues/ai-agents/queues'
import { getCopyrightEmailIntakeForAgent } from '@services/copyright-notices/email-intake-parses'
import { eraseTestCopyrightEmailIntakeOriginal } from '@voucha/test-helpers/copyright-email-intake-retention'
import { readCopyrightIntakeRetentionState } from '@voucha/test-helpers/copyright-email-retention-state'
import {
  SES_INBOUND_TEST_RECEIVED_AT,
  readCopyrightEmailAncestorKindForTest,
  readCopyrightEmailIntakeIdForTest,
  readCopyrightEmailIntakeVerdictsForTest,
  readCopyrightEmailParseFailureForTest,
  readCopyrightEmailThreadHeadersForTest,
  stubSesInboundS3ForTest,
} from '@voucha/test-helpers/ses-inbound-s3'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { processSesInboundEmail } from '../processors.mts'

vi.mock<typeof import('mailparser')>(import('mailparser'), async importOriginal => importOriginal())

const SES_HEADERS = [
  'X-SES-Spam-Verdict: PASS',
  'X-SES-Virus-Verdict: PROCESSING_FAILED',
  'Authentication-Results: amazonses.com; spf=fail; dkim=pass; dmarc=neutral;',
  'X-SES-RECEIPT: AEFBQUFBQUFBQUFH',
]

const PDF_BYTES = Buffer.from('%PDF-1.4 evidence')

function noticeEmail(options: { messageId: string; inReplyTo?: string }): string {
  return [
    ...SES_HEADERS,
    'From: Copyright claimant <claimant@example.test>',
    'To: dmca@inbound.voucha.ai',
    'Subject: Copyright notice',
    `Message-ID: ${options.messageId}`,
    ...(options.inReplyTo ? [`In-Reply-To: ${options.inReplyTo}`] : []),
    'References: <prior@example.test>',
    'MIME-Version: 1.0',
    'Content-Type: multipart/mixed; boundary="notice-boundary"',
    '',
    '--notice-boundary',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Notice body',
    '--notice-boundary',
    'Content-Type: application/pdf; name="evidence.pdf"',
    'Content-Disposition: attachment; filename="evidence.pdf"',
    'Content-Transfer-Encoding: base64',
    '',
    PDF_BYTES.toString('base64'),
    '--notice-boundary--',
    '',
  ].join('\r\n')
}

function senderlessEmail(): string {
  return [
    ...SES_HEADERS,
    'To: dmca@inbound.voucha.ai',
    'Subject: Unattributable',
    'Content-Type: text/plain; charset=utf-8',
    '',
    'No sender header.',
  ].join('\r\n')
}

function messageIdentity() {
  const sesMessageId = `ses-copyright-${randomUUID()}`
  return { sesMessageId, objectKey: `copyright-incoming/${sesMessageId}` }
}

function watchIntakeEnqueues() {
  const add = vi.spyOn(ai_agents, 'add')
  onTestFinished(() => add.mockRestore())
  return () => add.mock.calls.map(([, data]) => (data as { intake_id: string }).intake_id)
}

const sha256Hex = (raw: string) => createHash('sha256').update(raw).digest('hex')

// The intake switch gates decisions, not ingest (#1443): every test below runs with it off.
describe('SES copyright inbound routing while intake is switched off', () => {
  useCopyrightIntakeEnvironment({ enabled: false })

  it('finishes an erased SES replay without recopying evidence or recreating work', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const data = messageIdentity()
    const raw = noticeEmail({ messageId: `<${data.sesMessageId}@example.test>` })
    const s3Calls = stubSesInboundS3ForTest({ objects: { [data.objectKey]: raw } })
    const enqueuedIntakeIds = watchIntakeEnqueues()
    await processSesInboundEmail(data)
    const intakeId = (await readCopyrightEmailIntakeIdForTest(data.sesMessageId))!
    await eraseTestCopyrightEmailIntakeOriginal(intakeId)
    const firstRunCalls = s3Calls.length

    await processSesInboundEmail(data)

    expect(s3Calls.slice(firstRunCalls).map(call => call.command)).toEqual([
      'GetObjectCommand',
      'DeleteObjectCommand',
    ])
    expect(s3Calls.at(-1)!.input).toEqual({ Bucket: 'ses-inbound-test', Key: data.objectKey })
    expect(enqueuedIntakeIds()).toEqual([intakeId])
    expect(await readCopyrightIntakeRetentionState(intakeId)).toMatchObject({
      intakeExists: true,
      receiptExists: true,
      hasRawObject: false,
      parseCount: 1,
    })
  })

  it('ingests a notice and a reply, preserving the raw email before source cleanup', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const notice = messageIdentity()
    const noticeMessageId = `<${notice.sesMessageId}@example.test>`
    const noticeRaw = noticeEmail({ messageId: noticeMessageId })
    const reply = messageIdentity()
    const replyRaw = noticeEmail({
      messageId: `<${reply.sesMessageId}@example.test>`,
      inReplyTo: noticeMessageId,
    })
    const s3Calls = stubSesInboundS3ForTest({
      objects: { [notice.objectKey]: noticeRaw, [reply.objectKey]: replyRaw },
    })
    const enqueuedIntakeIds = watchIntakeEnqueues()

    await processSesInboundEmail(notice)

    const noticeEvidenceKey = `email/${notice.sesMessageId}/${sha256Hex(noticeRaw)}.eml`
    expect(s3Calls).toEqual([
      {
        command: 'GetObjectCommand',
        input: { Bucket: 'ses-inbound-test', Key: notice.objectKey },
      },
      {
        command: 'CopyObjectCommand',
        input: {
          Bucket: 'copyright-evidence-test',
          Key: noticeEvidenceKey,
          CopySource: `ses-inbound-test/${notice.objectKey}?versionId=version-1`,
          CopySourceIfMatch: '"etag-1"',
          MetadataDirective: 'COPY',
        },
      },
      {
        command: 'GetObjectCommand',
        input: { Bucket: 'ses-inbound-test', Key: notice.objectKey, VersionId: 'version-1' },
      },
      {
        command: 'DeleteObjectCommand',
        input: { Bucket: 'ses-inbound-test', Key: notice.objectKey },
      },
    ])
    const noticeIntakeId = (await readCopyrightEmailIntakeIdForTest(notice.sesMessageId))!
    expect(await getCopyrightEmailIntakeForAgent(noticeIntakeId)).toMatchObject({
      id: noticeIntakeId,
      received_at: SES_INBOUND_TEST_RECEIVED_AT,
      raw_storage_key: noticeEvidenceKey,
      raw_sha256: createHash('sha256').update(noticeRaw).digest(),
      raw_mime_type: 'message/rfc822',
      raw_byte_size: Buffer.byteLength(noticeRaw),
      senderEmail: 'claimant@example.test',
      senderName: 'Copyright claimant',
      subject: 'Copyright notice',
      bodyText: 'Notice body',
      attachments: [
        {
          filename: 'evidence.pdf',
          contentId: null,
          mimeType: 'application/pdf',
          byteSize: PDF_BYTES.length,
          sha256: createHash('sha256').update(PDF_BYTES).digest(),
        },
      ],
    })
    expect(await readCopyrightEmailIntakeVerdictsForTest(noticeIntakeId)).toEqual({
      spf: 'fail',
      dkim: 'pass',
      dmarc: 'gray',
      spam: 'pass',
      virus: 'processing_failed',
    })
    expect(enqueuedIntakeIds()).toEqual([noticeIntakeId])
    expect(
      await readCopyrightEmailThreadHeadersForTest(noticeIntakeId, notice.sesMessageId),
    ).toEqual({ messageId: noticeMessageId, inReplyTo: [], references: ['<prior@example.test>'] })

    await processSesInboundEmail(reply)

    const replyIntakeId = (await readCopyrightEmailIntakeIdForTest(reply.sesMessageId))!
    expect(replyIntakeId).not.toBe(noticeIntakeId)
    expect(enqueuedIntakeIds()).toEqual([noticeIntakeId, replyIntakeId])
    expect(await readCopyrightEmailThreadHeadersForTest(replyIntakeId, reply.sesMessageId)).toEqual(
      {
        messageId: `<${reply.sesMessageId}@example.test>`,
        inReplyTo: [noticeMessageId],
        references: ['<prior@example.test>'],
      },
    )
    expect(await readCopyrightEmailAncestorKindForTest(replyIntakeId, noticeIntakeId)).toBe(
      'in_reply_to',
    )
    expect(s3Calls.at(-1)).toEqual({
      command: 'DeleteObjectCommand',
      input: { Bucket: 'ses-inbound-test', Key: reply.objectKey },
    })
  })

  it('keeps an email whose sender name exceeds the intake limit as a failed intake', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const data = messageIdentity()
    const raw = noticeEmail({ messageId: `<${data.sesMessageId}@example.test>` }).replace(
      'From: Copyright claimant <claimant@example.test>',
      `From: ${'a'.repeat(501)} <claimant@example.test>`,
    )
    const s3Calls = stubSesInboundS3ForTest({ objects: { [data.objectKey]: raw } })
    const enqueuedIntakeIds = watchIntakeEnqueues()

    await processSesInboundEmail(data)

    const intakeId = (await readCopyrightEmailIntakeIdForTest(data.sesMessageId))!
    expect(await readCopyrightEmailParseFailureForTest(intakeId, data.sesMessageId)).toBe(
      'The original email could not be parsed as RFC 5322 MIME.',
    )
    expect(enqueuedIntakeIds()).toEqual([])
    expect(s3Calls.at(-1)).toEqual({
      command: 'DeleteObjectCommand',
      input: { Bucket: 'ses-inbound-test', Key: data.objectKey },
    })
  })

  it('keeps malformed MIME as a staff-visible failed intake before cleanup', async () => {
    vi.stubEnv('S3_BUCKET_SES_INBOUND', 'ses-inbound-test')
    const data = messageIdentity()
    const s3Calls = stubSesInboundS3ForTest({ objects: { [data.objectKey]: senderlessEmail() } })
    const enqueuedIntakeIds = watchIntakeEnqueues()

    await processSesInboundEmail(data)

    const intakeId = (await readCopyrightEmailIntakeIdForTest(data.sesMessageId))!
    expect(await readCopyrightEmailParseFailureForTest(intakeId, data.sesMessageId)).toBe(
      'The original email could not be parsed as RFC 5322 MIME.',
    )
    expect(await readCopyrightIntakeRetentionState(intakeId)).toMatchObject({
      intakeExists: true,
      hasRawObject: true,
      parseCount: 1,
      attachmentCount: 0,
    })
    expect(enqueuedIntakeIds()).toEqual([])
    expect(s3Calls.at(-1)).toEqual({
      command: 'DeleteObjectCommand',
      input: { Bucket: 'ses-inbound-test', Key: data.objectKey },
    })
  })
})
