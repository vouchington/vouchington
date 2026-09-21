import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { S3Client } from '@aws-sdk/client-s3'
import { createTestUser } from '@voucha/test-helpers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCopyrightEmailIntake } from './email-intakes.mts'
import { loadCopyrightEmailRawEvidence } from './email-raw-evidence.mts'

describe('copyright email raw evidence', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('returns the immutable original only to review staff after size and digest verification', async () => {
    const bytes = Buffer.from('From: claimant@example.test\r\n\r\nCopyright notice')
    const intake = await createIntake(bytes)
    const user = await createTestUser()
    const moderator = { ...user, roles: ['moderator'] } as typeof user
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: Readable.from([bytes]),
      ContentLength: bytes.byteLength,
    } as never)

    await expect(loadCopyrightEmailRawEvidence(intake.id, user)).resolves.toBeNull()
    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).resolves.toEqual({
      bytes,
      mimeType: 'message/rfc822',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    })
    expect(send).toHaveBeenCalledOnce()
  })

  it('refuses evidence whose bytes no longer match the immutable receipt', async () => {
    const bytes = Buffer.from('original email')
    const intake = await createIntake(bytes)
    const user = await createTestUser()
    const moderator = { ...user, roles: ['moderator'] } as typeof user
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: Readable.from([Buffer.from('tampered email')]),
      ContentLength: bytes.byteLength,
    } as never)

    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toThrow(
      /digest does not match/,
    )
  })

  it('refuses evidence whose object size no longer matches the immutable receipt', async () => {
    const bytes = Buffer.from('original email')
    const intake = await createIntake(bytes)
    const moderator = { ...(await createTestUser()), roles: ['moderator'] } as Awaited<
      ReturnType<typeof createTestUser>
    >
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: Readable.from([bytes]),
      ContentLength: bytes.byteLength + 1,
    } as never)

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
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
    vi.spyOn(S3Client.prototype, 'send')
      .mockResolvedValueOnce({
        Body: Readable.from([Buffer.concat([bytes, Buffer.from('x')])]),
      } as never)
      .mockResolvedValueOnce({
        Body: Readable.from([bytes.subarray(0, 4)]),
      } as never)

    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toThrow(
      /exceeds its immutable receipt size/,
    )
    await expect(loadCopyrightEmailRawEvidence(intake.id, moderator)).rejects.toThrow(
      /size does not match/,
    )
  })
})

async function createIntake(bytes: Buffer) {
  return (
    await createCopyrightEmailIntake({
      sesMessageId: `ses-raw-evidence-${crypto.randomUUID()}`,
      receivedAt: new Date(),
      rawStorageKey: `email/${crypto.randomUUID()}/original.eml`,
      rawSha256: createHash('sha256').update(bytes).digest(),
      rawMimeType: 'message/rfc822',
      rawByteSize: bytes.byteLength,
    })
  ).intake
}
