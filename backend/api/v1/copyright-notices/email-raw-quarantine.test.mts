import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { S3Client } from '@aws-sdk/client-s3'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  copyrightEmailSesVerdictsWithVirus,
  PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
} from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCopyrightEmailIntake,
  type CopyrightEmailSesVerdicts,
} from '@services/copyright-notices'

const bytes = Buffer.from('From: claimant@example.test\r\n\r\nCopyright notice')

async function createIntakeId(sesVerdicts: CopyrightEmailSesVerdicts) {
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId: `ses-api-quarantine-${crypto.randomUUID()}`,
    receivedAt: new Date(),
    rawStorageKey: `email/${crypto.randomUUID()}/original.eml`,
    rawSha256: createHash('sha256').update(bytes).digest(),
    rawMimeType: 'message/rfc822',
    rawByteSize: bytes.byteLength,
    sesVerdicts,
  })
  return intake.id
}

async function createModeratorRequest() {
  const moderator = createRequest()
  await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
  return moderator
}

describe('copyright email original download', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('refuses to download an original SES reported as malware and says why', async () => {
    const intakeId = await createIntakeId(copyrightEmailSesVerdictsWithVirus('fail'))
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    const send = vi.spyOn(S3Client.prototype, 'send')
    const moderator = await createModeratorRequest()

    const refused = await moderator
      .get(`/api/v1/copyright-email-intakes/${intakeId}/raw`)
      .expect(409)
    expect(refused.body).toMatchObject({
      code: 'COPYRIGHT_EMAIL_QUARANTINED',
      message: expect.stringContaining('malware'),
    })
    expect(refused.headers['cache-control']).toBe('private, no-store')
    expect(send).not.toHaveBeenCalled()

    const detail = await moderator.get(`/api/v1/copyright-email-intakes/${intakeId}`).expect(200)
    expect(detail.body.copyright_email_intake).toMatchObject({
      ses_verdicts: { virus: 'fail' },
      raw_email: { download_url: null },
    })
  })

  it('still downloads an original SES passed', async () => {
    const intakeId = await createIntakeId(PASSING_COPYRIGHT_EMAIL_SES_VERDICTS)
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: Readable.from([bytes]),
      ContentLength: bytes.byteLength,
    } as never)
    const moderator = await createModeratorRequest()

    const raw = await moderator.get(`/api/v1/copyright-email-intakes/${intakeId}/raw`).expect(200)
    expect(raw.headers['content-type']).toBe('message/rfc822')
  })
})
