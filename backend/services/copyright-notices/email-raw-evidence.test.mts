import { copyrightEmailSesVerdictsWithVirus } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { createHash } from 'node:crypto'
import { createTestUser } from '@voucha/test-helpers'
import { putS3Object } from '@voucha/test-helpers/aws-emulator-s3'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { omitS3ImagesClientResponseFieldsForTest } from '@voucha/test-helpers/s3-images-client-injection'
import { describe, expect, it } from 'vitest'
import { COPYRIGHT_EMAIL_QUARANTINED } from '@modules/on-error/error-codes'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { loadCopyrightEmailRawEvidence } from './email-raw-evidence.mts'

describe('copyright email raw evidence', () => {
  const bucket = useCopyrightEvidenceBucket()

  it('returns the immutable original only to review staff after size and digest verification', async () => {
    const bytes = Buffer.from('From: claimant@example.test\r\n\r\nCopyright notice')
    const intake = await createIntake(bytes)
    await storeEvidence(intake.raw_storage_key, bytes)
    const user = await createTestUser()
    const moderator = { ...user, roles: ['moderator'] } as typeof user

    await expect(loadCopyrightEmailRawEvidence(intake.id, user)).resolves.toBeNull()
    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).resolves.toEqual({
      bytes,
      mimeType: 'message/rfc822',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
  })

  // No object is stored: reading it would surface NoSuchKey instead of the quarantine refusal.
  it('quarantines an original SES reported as malware without reading the stored object', async () => {
    const bytes = Buffer.from('From: claimant@example.test\r\n\r\nInfected attachment')
    const intake = await createIntake(bytes, copyrightEmailSesVerdictsWithVirus('fail'))
    const user = await createTestUser()
    const moderator = { ...user, roles: ['moderator'] } as typeof user

    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toMatchObject({
      status: 409,
      code: COPYRIGHT_EMAIL_QUARANTINED,
      message: expect.stringContaining('passing virus scan'),
    })
    await expect(loadCopyrightEmailRawEvidence(intake.id, user)).resolves.toBeNull()
  })

  it.each(['gray', 'processing_failed', 'unknown'] as const)(
    'quarantines an original SES did not clear (virus %s) without reading it',
    async virus => {
      const bytes = Buffer.from('From: claimant@example.test\r\n\r\nUnscanned notice')
      const intake = await createIntake(bytes, copyrightEmailSesVerdictsWithVirus(virus))
      const moderator = { ...(await createTestUser()), roles: ['moderator'] } as Awaited<
        ReturnType<typeof createTestUser>
      >

      await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toMatchObject({
        status: 409,
        code: COPYRIGHT_EMAIL_QUARANTINED,
        message: expect.stringContaining('passing virus scan'),
      })
    },
  )

  it('refuses evidence whose bytes no longer match the immutable receipt', async () => {
    const bytes = Buffer.from('original email')
    const intake = await createIntake(bytes)
    await storeEvidence(intake.raw_storage_key, Buffer.from('tampered email'))
    const moderator = { ...(await createTestUser()), roles: ['moderator'] } as Awaited<
      ReturnType<typeof createTestUser>
    >

    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toThrow(
      /digest does not match/,
    )
  })

  it('refuses evidence whose object size no longer matches the immutable receipt', async () => {
    const bytes = Buffer.from('original email')
    const intake = await createIntake(bytes)
    await storeEvidence(intake.raw_storage_key, Buffer.concat([bytes, Buffer.from('x')]))
    const moderator = { ...(await createTestUser()), roles: ['moderator'] } as Awaited<
      ReturnType<typeof createTestUser>
    >

    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toThrow(
      /size does not match/,
    )
  })

  it('refuses a truncated or oversized evidence stream', async () => {
    const bytes = Buffer.from('original email')
    const intake = await createIntake(bytes)
    const moderator = { ...(await createTestUser()), roles: ['moderator'] } as Awaited<
      ReturnType<typeof createTestUser>
    >
    // S3 always sends Content-Length, so only the stream counter guards a response without it.
    omitS3ImagesClientResponseFieldsForTest('GetObjectCommand', ['ContentLength'])

    await storeEvidence(intake.raw_storage_key, Buffer.concat([bytes, Buffer.from('x')]))
    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toThrow(
      /exceeds its immutable receipt size/,
    )
    await storeEvidence(intake.raw_storage_key, bytes.subarray(0, 4))
    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toThrow(
      /size does not match/,
    )
  })

  async function storeEvidence(key: string | null, body: Buffer): Promise<void> {
    if (!key) throw new Error('The intake has no evidence key')
    await putS3Object({ Bucket: bucket.name(), Key: key, Body: body })
  }
})

async function createIntake(
  bytes: Buffer,
  sesVerdicts = copyrightEmailSesVerdictsWithVirus('pass'),
) {
  return (
    await createCopyrightEmailIntake({
      sesMessageId: `ses-raw-evidence-${crypto.randomUUID()}`,
      receivedAt: new Date(),
      rawStorageKey: `email/${crypto.randomUUID()}/original.eml`,
      rawSha256: createHash('sha256').update(bytes).digest(),
      rawMimeType: 'message/rfc822',
      rawByteSize: bytes.byteLength,
      sesVerdicts,
    })
  ).intake
}
