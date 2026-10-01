import { createTestUser } from '@voucha/test-helpers'
import { readCopyrightEmailIntakeSesVerdicts } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import {
  copyrightEmailSesVerdictsWithVirus,
  PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
} from '@voucha/test-helpers/services/copyright-notices/email-ses-verdicts'
import { describe, expect, it } from 'vitest'
import type { CopyrightEmailSesVerdicts } from './email-ses-verdicts.mts'
import { createCopyrightEmailIntake, getCopyrightStaffEmailIntake } from './index.mts'

async function createStaffIntake(sesVerdicts: CopyrightEmailSesVerdicts) {
  const user = await createTestUser()
  const moderator = { ...user, roles: ['moderator'] } as typeof user
  const intake = await createIntake(sesVerdicts)
  return getCopyrightStaffEmailIntake(intake.id, moderator)
}

async function createIntake(sesVerdicts: CopyrightEmailSesVerdicts) {
  const sesMessageId = `ses-staff-verdicts-${crypto.randomUUID()}`
  const { intake } = await createCopyrightEmailIntake({
    sesMessageId,
    receivedAt: new Date(),
    rawStorageKey: `email/${sesMessageId}/original.eml`,
    rawSha256: Buffer.alloc(32, 11),
    rawMimeType: 'message/rfc822',
    rawByteSize: 12,
    sesVerdicts,
  })
  return intake
}

describe('staff email intake SES verdicts', () => {
  it('shows staff the SES verdicts and offers the original for download', async () => {
    const sesVerdicts = {
      spf: 'fail',
      dkim: 'gray',
      dmarc: 'fail',
      spam: 'pass',
      virus: 'pass',
    } as const
    const view = await createStaffIntake(sesVerdicts)

    expect(view).toMatchObject({
      ses_verdicts: sesVerdicts,
      raw_email: {
        download_url: expect.stringMatching(/^\/api\/v1\/copyright-email-intakes\/.+\/raw$/),
      },
    })
  })

  it('withholds the download link for a message SES reported as malware', async () => {
    const view = await createStaffIntake(copyrightEmailSesVerdictsWithVirus('fail'))

    expect(view).toMatchObject({
      ses_verdicts: { virus: 'fail' },
      raw_email: { download_url: null, byte_size: 12 },
    })
  })

  it.each(['gray', 'processing_failed', 'unknown'] as const)(
    'keeps the download link when the SES malware verdict is %s',
    async virus => {
      const view = await createStaffIntake({ ...PASSING_COPYRIGHT_EMAIL_SES_VERDICTS, virus })

      expect(view?.raw_email.download_url).toEqual(expect.any(String))
      expect(view?.ses_verdicts.virus).toBe(virus)
    },
  )

  it('stores the SES verdicts with the immutable intake and keeps the first on replay', async () => {
    const sesMessageId = `ses-verdicts-${crypto.randomUUID()}`
    const sesVerdicts = {
      spf: 'pass',
      dkim: 'fail',
      dmarc: 'gray',
      spam: 'processing_failed',
      virus: 'unknown',
    } as const
    const input = {
      sesMessageId,
      receivedAt: new Date('2026-07-01T12:00:00.000Z'),
      rawStorageKey: `email/${sesMessageId}/original.eml`,
      rawSha256: Buffer.alloc(32, 9),
      rawMimeType: 'message/rfc822',
      rawByteSize: 21,
      sesVerdicts,
    }
    const created = await createCopyrightEmailIntake(input)

    await expect(readCopyrightEmailIntakeSesVerdicts(created.intake.id)).resolves.toEqual(
      sesVerdicts,
    )
    // The same bytes always carry the same verdicts, so a replay never rewrites what SES reported.
    const replay = await createCopyrightEmailIntake({
      ...input,
      sesVerdicts: PASSING_COPYRIGHT_EMAIL_SES_VERDICTS,
    })
    expect(replay).toEqual({ intake: created.intake, isNew: false })
    await expect(readCopyrightEmailIntakeSesVerdicts(created.intake.id)).resolves.toEqual(
      sesVerdicts,
    )
  })

  it('rejects a verdict outside the SES vocabulary rather than storing it as a pass', async () => {
    const sesMessageId = `ses-bad-verdict-${crypto.randomUUID()}`
    await expect(
      createCopyrightEmailIntake({
        sesMessageId,
        receivedAt: new Date(),
        rawStorageKey: `email/${sesMessageId}/original.eml`,
        rawSha256: Buffer.alloc(32, 10),
        rawMimeType: 'message/rfc822',
        rawByteSize: 5,
        sesVerdicts: { ...PASSING_COPYRIGHT_EMAIL_SES_VERDICTS, virus: 'clean' as never },
      }),
    ).rejects.toThrow(/check constraint/)
  })
})
