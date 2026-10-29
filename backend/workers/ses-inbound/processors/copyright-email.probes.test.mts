import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import type {
  createCopyrightEmailIntake,
  recordCopyrightEmailParse,
} from '@services/copyright-notices'
import { ErasedCopyrightEmailIntakeReplay } from '@services/copyright-notices/email-intakes'
import type {
  copySesInboundObjectToCopyrightEvidence,
  loadSesInboundObjectAndHash,
  loadSesInboundObjectVersion,
} from './s3.mts'
import type { parseSesInboundMime } from './mime.mts'
import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { processSesInboundEmail } from '../processors.mts'

type ParsedSesInboundEmail = Awaited<ReturnType<typeof parseSesInboundMime>>

describe('erased SES copyright replay', () => {
  useCopyrightIntakeEnvironment({ enabled: false })

  it('finishes an erased SES replay without recopying evidence or recreating work', async () => {
    const copy = vi.fn<typeof copySesInboundObjectToCopyrightEvidence>()
    const parse = vi.fn<typeof recordCopyrightEmailParse>()
    const enqueue = vi.fn<(intakeId: string) => Promise<void>>()
    const deleteSource = vi.fn<(key: string) => Promise<void>>().mockResolvedValue(undefined)
    await processSesInboundEmail(
      {
        sesMessageId: 'erased-ses-message',
        objectKey: 'copyright-incoming/erased-ses-message',
      },
      {
        loadSesInboundObjectAndHash: vi.fn<typeof loadSesInboundObjectAndHash>().mockResolvedValue({
          rawMime: Readable.from([Buffer.from('raw')]),
          digest: Promise.resolve({
            sha256: Buffer.alloc(32, 1),
            byteSize: 3,
            sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
          }),
          receivedAt: new Date(),
          sourceIdentity: { eTag: 'etag', versionId: 'version' },
        }),
        loadSesInboundObjectVersion: vi.fn<typeof loadSesInboundObjectVersion>(),
        copySesInboundObjectToCopyrightEvidence: copy,
        createCopyrightEmailIntake: vi
          .fn<typeof createCopyrightEmailIntake>()
          .mockRejectedValue(new ErasedCopyrightEmailIntakeReplay()),
        parseSesInboundMime: vi.fn<() => Promise<ParsedSesInboundEmail>>(),
        recordCopyrightEmailParse: parse,
        enqueueCopyrightEmailIntake: enqueue,
        deleteSesInboundObject: deleteSource,
      },
    )
    expect(copy).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
    expect(enqueue).not.toHaveBeenCalled()
    expect(deleteSource).toHaveBeenCalledWith('copyright-incoming/erased-ses-message')
  })
})
