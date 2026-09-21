import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createCopyrightEmailIntake } from '@services/copyright-notices'

describe('copyright API cache policy', () => {
  beforeEach(() => {
    vi.stubEnv('COPYRIGHT_INTAKE_ENABLED', 'true')
    vi.stubEnv('S3_BUCKET_COPYRIGHT_EVIDENCE', 'copyright-evidence-test')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('marks member, staff, and raw-email responses private and no-store', async () => {
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    expect(
      (await member.get('/api/v1/copyright-notices').expect(200)).headers['cache-control'],
    ).toBe('private, no-store')

    const moderator = createRequest()
    await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    expect(
      (await moderator.get('/api/v1/copyright-notices/review-queue').expect(200)).headers[
        'cache-control'
      ],
    ).toBe('private, no-store')

    const bytes = Buffer.from('From: claimant@example.test\r\n\r\nCopyright notice')
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId: `ses-api-raw-${crypto.randomUUID()}`,
      receivedAt: new Date(),
      rawStorageKey: `email/${crypto.randomUUID()}/original.eml`,
      rawSha256: createHash('sha256').update(bytes).digest(),
      rawMimeType: 'message/rfc822',
      rawByteSize: bytes.byteLength,
    })
    vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: Readable.from([bytes]),
      ContentLength: bytes.byteLength,
    } as never)
    const raw = await moderator.get(`/api/v1/copyright-email-intakes/${intake.id}/raw`).expect(200)
    expect(raw.headers).toMatchObject({
      'cache-control': 'private, no-store',
      'content-type': 'message/rfc822',
      'content-disposition': 'attachment; filename="original-email.eml"',
      'x-content-type-options': 'nosniff',
    })
  })
})
