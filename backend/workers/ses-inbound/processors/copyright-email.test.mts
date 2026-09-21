import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import {
  processCopyrightInboundEmail,
  type CopyrightEmailDependencies,
} from './copyright-email.mts'

const intake = {
  id: '00000000-0000-7000-8000-000000000081',
  ses_message_id: 'ses-untrusted',
  received_at: new Date('2026-07-01T12:00:00.000Z'),
  raw_storage_key: 'copyright-evidence/ses-untrusted',
  raw_sha256: Buffer.alloc(32, 1),
  raw_mime_type: 'message/rfc822',
  raw_byte_size: 3,
}

describe('processCopyrightInboundEmail', () => {
  it('records a failed parse when MIME shape is untrusted', async () => {
    const recordCopyrightEmailParse = vi.fn<
      CopyrightEmailDependencies['recordCopyrightEmailParse']
    >(async () => undefined)
    const dependencies: CopyrightEmailDependencies = {
      loadSesInboundObjectAndHash: async () => ({
        rawMime: Readable.from([Buffer.from('raw')]),
        digest: Promise.resolve({ sha256: Buffer.alloc(32, 1), byteSize: 3 }),
        receivedAt: intake.received_at,
        sourceIdentity: { eTag: '"etag-1"' },
      }),
      copySesInboundObjectToCopyrightEvidence: async () => intake.raw_storage_key,
      createCopyrightEmailIntake: async () => ({ intake, isNew: true }),
      loadSesInboundObjectVersion: async () => Readable.from([Buffer.from('raw')]),
      parseSesInboundMime: async () => {
        throw Object.assign(new Error('untrusted MIME'), { status: 422 })
      },
      recordCopyrightEmailParse,
      enqueueCopyrightEmailIntakeAndWait: async () => undefined,
    }

    await processCopyrightInboundEmail(
      {
        sesMessageId: intake.ses_message_id,
        objectKey: 'copyright-incoming/ses-untrusted',
        intakeKind: 'copyright',
      },
      dependencies,
    )

    expect(recordCopyrightEmailParse).toHaveBeenCalledWith(intake, {
      status: 'failed',
      error: 'The original email could not be parsed as RFC 5322 MIME.',
    })
  })
})
