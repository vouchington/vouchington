import { createTestUser } from '@voucha/test-helpers'
import { eraseTestCopyrightEmailIntakeOriginal } from '@voucha/test-helpers/copyright-email-intake-retention'
import {
  commitCopyrightEmailReceiptErasureMarker,
  readCopyrightEmailReceiptErasedAt,
  readCopyrightIntakeRetentionState,
} from '@voucha/test-helpers/copyright-email-retention-state'
import { createRetentionParsedEmail } from '@voucha/test-helpers/services/copyright-notices/retention-parsed-email'
import { describe, expect, it } from 'vitest'
import { getCopyrightStaffEmailIntake } from './read-models-staff-email-intake.mts'

describe('staff email intake source availability', () => {
  it.each([
    {
      label: 'its receipt is marked erased',
      changeSource: commitCopyrightEmailReceiptErasureMarker,
      erasedAt: expect.any(Date),
      hasRawObject: true,
    },
    {
      label: 'its original pointer is cleared',
      changeSource: eraseTestCopyrightEmailIntakeOriginal,
      erasedAt: null,
      hasRawObject: false,
    },
  ])('hides the detail when $label', async ({ changeSource, erasedAt, hasRawObject }) => {
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const label = 'staff-detail-retention'
    const intake = await createRetentionParsedEmail(label, { reply: true })

    await expect(getCopyrightStaffEmailIntake(intake.id, moderator)).resolves.toMatchObject({
      id: intake.id,
      parsed_email: { subject: `Subject ${label}`, body_text: `Body of ${label}` },
      raw_email: { download_url: `/api/v1/copyright-email-intakes/${intake.id}/raw` },
    })

    await changeSource(intake.id)

    await expect(readCopyrightEmailReceiptErasedAt(intake.id)).resolves.toEqual(erasedAt)
    await expect(readCopyrightIntakeRetentionState(intake.id)).resolves.toMatchObject({
      intakeExists: true,
      hasRawObject,
      parseCount: 1,
    })
    await expect(getCopyrightStaffEmailIntake(intake.id, moderator)).resolves.toBeNull()
  })
})
