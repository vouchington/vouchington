import { PASSING_COPYRIGHT_EMAIL_SES_VERDICTS } from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { putS3Object } from '@voucha/test-helpers/aws-emulator-s3'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import { useCopyrightEvidenceBucket } from '@voucha/test-helpers/services/copyright-notices/retention-evidence-bucket'
import { readOwnedCopyrightEmailQueue } from '@voucha/test-helpers/copyright-email-queue-http-contract'
import { createCopyrightEmailIntake } from '@services/copyright-notices'

describe('copyright API cache policy', () => {
  useCopyrightIntakeEnvironment()
  // Registered after the intake environment so its bucket replaces the placeholder name.
  const evidence = useCopyrightEvidenceBucket()

  it('marks member, staff, and raw-email responses private and no-store', async () => {
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    expect(
      (await member.get('/api/v1/copyright-notices').expect(200)).headers['cache-control'],
    ).toBe('private, no-store')

    const moderator = createRequest()
    const moderatorUser = await createTestUser({ extraRoles: ['moderator'] })
    await moderator.authenticateAs(moderatorUser)
    const bytes = Buffer.from('From: claimant@example.test\r\n\r\nCopyright notice')
    const rawStorageKey = `email/${crypto.randomUUID()}/original.eml`
    await putS3Object({ Bucket: evidence.name(), Key: rawStorageKey, Body: bytes })
    const { intake } = await createCopyrightEmailIntake({
      sesMessageId: `ses-api-raw-${crypto.randomUUID()}`,
      receivedAt: new Date(),
      rawStorageKey,
      rawSha256: createHash('sha256').update(bytes).digest(),
      rawMimeType: 'message/rfc822',
      rawByteSize: bytes.byteLength,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    const staff = await readOwnedCopyrightEmailQueue(moderator, moderatorUser, {
      id: intake.id,
      receivedAt: intake.received_at,
    })
    expect(staff.headers['cache-control']).toBe('private, no-store')

    const raw = await moderator.get(`/api/v1/copyright-email-intakes/${intake.id}/raw`).expect(200)
    expect(raw.headers).toMatchObject({
      'cache-control': 'private, no-store',
      'content-type': 'message/rfc822',
      'content-disposition': 'attachment; filename="original-email.eml"',
      'x-content-type-options': 'nosniff',
    })
  })
})
