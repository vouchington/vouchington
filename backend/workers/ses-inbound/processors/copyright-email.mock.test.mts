import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '@services/copyright-notices'
import type {
  copySesInboundObjectToCopyrightEvidence,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
} from './s3.mts'
import { SesInboundTerminalError, type ParsedSesInboundEmail } from './mime.mts'
import { processSesInboundEmail } from '../processors.mts'

vi.mock<typeof import('mailparser')>(
  import('mailparser'),
  async importOriginal => await importOriginal(),
)

describe('SES copyright inbound routing', () => {
  it('preserves the raw email before source cleanup and awaits agent enqueue', async () => {
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
    const data = {
      sesMessageId: 'ses-copyright-message',
      objectKey: 'copyright-incoming/ses-copyright-message',
      intakeKind: 'copyright' as const,
    }
    const deleteObject = vi.fn<(objectKey: string) => Promise<void>>().mockResolvedValue(undefined)
    const createIntake = vi.fn<typeof createCopyrightEmailIntake>().mockResolvedValue({
      intake: {
        id: 'intake-id',
        ses_message_id: data.sesMessageId,
        received_at: new Date(),
        raw_storage_key: 'email/ses-copyright-message/original.eml',
        raw_sha256: Buffer.alloc(32, 7),
        raw_mime_type: 'message/rfc822',
        raw_byte_size: 3,
      },
      isNew: true,
    })
    const enqueue = vi.fn<(intakeId: string) => Promise<void>>().mockResolvedValue(undefined)
    const recordParse = vi.fn<typeof recordCopyrightEmailParse>().mockResolvedValue(undefined)
    const createSupport = vi.fn<() => Promise<{ is_new: false }>>()
    const parsed: ParsedSesInboundEmail = {
      fromEmail: 'claimant@example.test',
      subject: 'Copyright notice',
      bodyText: 'Notice body',
      emailMessageId: '<copyright@example.test>',
      replyRefs: ['<prior@example.test>'],
      recipientEmails: ['dmca@inbound.voucha.ai'],
      attachments: [],
    }

    await processSesInboundEmail(data, {
      isInboundSupportEmailComplete: vi.fn<() => Promise<boolean>>().mockResolvedValue(false),
      parseSesInboundMime: vi.fn<() => Promise<ParsedSesInboundEmail>>().mockResolvedValue(parsed),
      loadSesInboundObjectAndHash: vi.fn<typeof loadSesInboundObjectAndHash>().mockResolvedValue({
        rawMime: Readable.from([Buffer.from('raw')]),
        digest: Promise.resolve({ sha256: Buffer.alloc(32, 7), byteSize: 3 }),
        receivedAt: new Date('2026-07-01T12:00:00.000Z'),
        sourceIdentity: { eTag: '"etag-1"', versionId: 'version-1' },
      }),
      loadSesInboundObjectVersion: vi
        .fn<typeof loadSesInboundObjectVersion>()
        .mockResolvedValue(Readable.from([Buffer.from('raw')])),
      copySesInboundObjectToCopyrightEvidence: vi
        .fn<typeof copySesInboundObjectToCopyrightEvidence>()
        .mockResolvedValue(
          `email/ses-copyright-message/${Buffer.alloc(32, 7).toString('hex')}.eml`,
        ),
      createCopyrightEmailIntake: createIntake,
      recordCopyrightEmailParse: recordParse,
      enqueueCopyrightEmailIntakeAndWait: enqueue,
      createInboundSupportEmailMessage: createSupport,
      deleteSesInboundObject: deleteObject,
    })

    expect(createIntake).toHaveBeenCalledWith(
      expect.objectContaining({
        sesMessageId: data.sesMessageId,
        rawStorageKey: `email/ses-copyright-message/${Buffer.alloc(32, 7).toString('hex')}.eml`,
        rawSha256: Buffer.alloc(32, 7),
        receivedAt: new Date('2026-07-01T12:00:00.000Z'),
      }),
    )
    expect(enqueue).toHaveBeenCalledWith('intake-id')
    expect(recordParse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'intake-id' }),
      expect.objectContaining({
        status: 'succeeded',
        fromEmail: 'claimant@example.test',
        messageId: '<copyright@example.test>',
        replyReferences: ['<prior@example.test>'],
      }),
    )
    expect(createSupport).not.toHaveBeenCalled()
    expect(deleteObject).toHaveBeenCalledWith(data.objectKey)
    vi.unstubAllEnvs()
  })

  it('keeps malformed MIME as a staff-visible failed intake before cleanup', async () => {
    const data = {
      sesMessageId: 'ses-malformed-copyright',
      objectKey: 'copyright-incoming/ses-malformed-copyright',
      intakeKind: 'copyright' as const,
    }
    const intake = {
      id: 'failed-intake-id',
      ses_message_id: data.sesMessageId,
      received_at: new Date(),
      raw_storage_key: 'email/ses-malformed-copyright/evidence.eml',
      raw_sha256: Buffer.alloc(32, 8),
      raw_mime_type: 'message/rfc822',
      raw_byte_size: 3,
    }
    const recordParse = vi.fn<typeof recordCopyrightEmailParse>().mockResolvedValue(undefined)
    const deleteObject = vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined)
    const enqueue = vi.fn<(intakeId: string) => Promise<void>>()

    await processSesInboundEmail(data, {
      loadSesInboundObjectAndHash: vi.fn<typeof loadSesInboundObjectAndHash>().mockResolvedValue({
        rawMime: Readable.from([Buffer.from('raw')]),
        digest: Promise.resolve({ sha256: Buffer.alloc(32, 8), byteSize: 3 }),
        receivedAt: new Date('2026-07-01T12:00:00.000Z'),
        sourceIdentity: { eTag: '"etag-2"' },
      }),
      copySesInboundObjectToCopyrightEvidence: vi
        .fn<typeof copySesInboundObjectToCopyrightEvidence>()
        .mockResolvedValue(intake.raw_storage_key),
      createCopyrightEmailIntake: vi.fn<typeof createCopyrightEmailIntake>().mockResolvedValue({
        intake,
        isNew: true,
      }),
      loadSesInboundObjectVersion: vi
        .fn<typeof loadSesInboundObjectVersion>()
        .mockResolvedValue(Readable.from([Buffer.from('raw')])),
      parseSesInboundMime: vi
        .fn<() => Promise<ParsedSesInboundEmail>>()
        .mockRejectedValue(new SesInboundTerminalError('invalid MIME')),
      recordCopyrightEmailParse: recordParse,
      enqueueCopyrightEmailIntakeAndWait: enqueue,
      deleteSesInboundObject: deleteObject,
    })

    expect(recordParse).toHaveBeenCalledWith(intake, {
      status: 'failed',
      error: 'The original email could not be parsed as RFC 5322 MIME.',
    })
    expect(enqueue).not.toHaveBeenCalled()
    expect(deleteObject).toHaveBeenCalledWith(data.objectKey)
  })
})
