import { createHash } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import { putS3Object } from '@voucha/test-helpers/aws-emulator-s3'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  copyrightEmailSesVerdictsWithVirus,
  PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
} from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { describe, expect, it } from 'vitest'
import {
  createCopyrightEmailIntake,
  type CopyrightEmailSesVerdicts,
} from '@services/copyright-notices'

const bytes = Buffer.from('From: claimant@example.test\r\n\r\nCopyright notice')

async function createIntakeId(sesVerdicts: CopyrightEmailSesVerdicts, bucket: string) {
  const rawStorageKey = `email/${crypto.randomUUID()}/original.eml`
  await putS3Object({ Bucket: bucket, Key: rawStorageKey, Body: bytes })
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId: `ses-api-quarantine-${crypto.randomUUID()}`,
    receivedAt: new Date(),
    rawStorageKey,
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
  const evidence = useCopyrightEvidenceBucket()

  it.each(['fail', 'gray', 'processing_failed', 'unknown'] as const)(
    'refuses an original without a passing SES virus verdict (%s)',
    async virus => {
      // The stored original is intact, so only the verdict can refuse the download.
      const intakeId = await createIntakeId(
        copyrightEmailSesVerdictsWithVirus(virus),
        evidence.name(),
      )
      const moderator = await createModeratorRequest()

      const refused = await moderator
        .get(`/api/v1/copyright-email-intakes/${intakeId}/raw`)
        .expect(409)
      expect(refused.body).toMatchObject({
        code: 'COPYRIGHT_EMAIL_QUARANTINED',
        message: expect.any(String),
      })
      expect(refused.headers['cache-control']).toBe('private, no-store')

      const detail = await moderator.get(`/api/v1/copyright-email-intakes/${intakeId}`).expect(200)
      expect(detail.body.copyright_email_intake).toMatchObject({
        ses_verdicts: { virus },
        raw_email: { download_url: null },
      })
    },
  )

  it('still downloads an original SES passed', async () => {
    const intakeId = await createIntakeId(PASSING_COPYRIGHT_EMAIL_SES_VERDICTS, evidence.name())
    const moderator = await createModeratorRequest()

    const raw = await moderator
      .get(`/api/v1/copyright-email-intakes/${intakeId}/raw`)
      .buffer(true)
      .parse((stream, done) => {
        const chunks: Buffer[] = []
        stream.on('data', (chunk: Buffer) => chunks.push(chunk))
        stream.on('end', () => done(null, Buffer.concat(chunks)))
        stream.on('error', done)
      })
      .expect(200)
    expect(raw.headers['content-type']).toBe('message/rfc822')
    expect(raw.body).toEqual(bytes)
  })
})
