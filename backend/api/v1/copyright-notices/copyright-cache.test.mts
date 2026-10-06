import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { S3Client } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { createCopyrightEmailIntake } from '@services/copyright-notices'

describe('copyright API cache policy', () => {
  useCopyrightIntakeEnvironment()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks member, staff, and raw-email responses private and no-store', async () => {
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    expect(
      (await member.get('/api/v1/copyright-notices').expect(200)).headers['cache-control'],
    ).toBe('private, no-store')

    const moderator = createRequest()
    await moderator.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const bytes = Buffer.from('From: claimant@example.test\r\n\r\nCopyright notice')
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId: `ses-api-raw-${crypto.randomUUID()}`,
      receivedAt: new Date(),
      rawStorageKey: `email/${crypto.randomUUID()}/original.eml`,
      rawSha256: createHash('sha256').update(bytes).digest(),
      rawMimeType: 'message/rfc822',
      rawByteSize: bytes.byteLength,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
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
