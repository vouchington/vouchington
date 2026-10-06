import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from './email-intake-test-fixtures.mts'
import { recordCopyrightEmailIntakeLegalProcess } from './index.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email legal process queue', () => {
  it('removes a legal-process intake from the staff email queue and keeps the undecided ones', async () => {
    const anchor = Date.now()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const subpoena = await createParsedCopyrightEmailIntake(new Date(anchor + 1))
    const foreign = await createParsedCopyrightEmailIntake(new Date(anchor + 2))
    const unparsedSubpoena = await createUnparsedCopyrightEmailIntake(new Date(anchor + 3))
    const waiting = await createParsedCopyrightEmailIntake(new Date(anchor + 4))
    const intakeIds = [subpoena.id, unparsedSubpoena.id, waiting.id]
    const queued = async () =>
      (
        await searchCopyrightStaffEmailIntakes(moderator, { limit: intakeIds.length, intakeIds })
      ).intakes.map(intake => intake.id)
    await expect(queued()).resolves.toEqual([subpoena.id, unparsedSubpoena.id, waiting.id])
    expect(await queued()).not.toContain(foreign.id)

    for (const intake of [subpoena, unparsedSubpoena]) {
      await recordCopyrightEmailIntakeLegalProcess({
        currentUser: moderator,
        intakeId: intake.id,
        reason: 'Subpoena for subscriber records.',
      })
    }

    await expect(queued()).resolves.toEqual([waiting.id])
  })
})
