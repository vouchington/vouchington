import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from './email-intake-test-fixtures.mts'
import { recordCopyrightEmailIntakeLegalProcess } from './index.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'

describe('copyright email legal process queue', () => {
  it('removes a legal-process intake from the staff email queue and keeps the undecided ones', async () => {
    if (getIsolatedDatabaseCaseMode('copyright-email-legal-process-queue') === 'parent') {
      await runIsolatedDatabaseCase('copyright-email-legal-process-queue')
      return
    }

    const anchor = new Date('2020-01-01T00:00:00.000Z').getTime()
    const moderatorRecord = await createTestUser()
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const subpoena = await createParsedCopyrightEmailIntake(new Date(anchor + 1))
    const unparsedSubpoena = await createUnparsedCopyrightEmailIntake(new Date(anchor + 2))
    const waiting = await createParsedCopyrightEmailIntake(new Date(anchor + 3))
    const queued = async () =>
      (await searchCopyrightStaffEmailIntakes(moderator, { limit: 10 })).intakes.map(
        intake => intake.id,
      )
    await expect(queued()).resolves.toEqual([subpoena.id, unparsedSubpoena.id, waiting.id])

    for (const intake of [subpoena, unparsedSubpoena]) {
      await recordCopyrightEmailIntakeLegalProcess({
        currentUser: moderator,
        intakeId: intake.id,
        reason: 'Subpoena for subscriber records.',
      })
    }

    await expect(queued()).resolves.toEqual([waiting.id])
  }, 240_000)
})
