import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getIsolatedDatabaseCaseMode } from '../../../test-helpers/vitest-isolated-database-cases.mts'
import { runIsolatedDatabaseCase } from '../../../test-helpers/vitest-isolated-database-case.mts'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from './email-intake-test-fixtures.mts'

describe('searchCopyrightStaffEmailIntakes', () => {
  it('hides the queue from non-reviewers and lists unreviewed intakes, parsed or not, for staff', async () => {
    const anchor = new Date('2020-01-01T00:00:00.000Z')
    if (getIsolatedDatabaseCaseMode('copyright-staff-email-intakes') === 'parent') {
      await createParsedCopyrightEmailIntake(new Date(anchor.getTime() - 1))
      for (const offset of [1, 2, 3]) {
        await createParsedCopyrightEmailIntake(new Date(anchor.getTime() + offset))
      }
      await runIsolatedDatabaseCase('copyright-staff-email-intakes')
      return
    }

    const [viewer, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const pending = await createParsedCopyrightEmailIntake(new Date(anchor.getTime() + 4))
    const second = await createParsedCopyrightEmailIntake(new Date(anchor.getTime() + 5))
    const third = await createParsedCopyrightEmailIntake(new Date(anchor.getTime() + 6))
    const rejected = await createParsedCopyrightEmailIntake(new Date(anchor.getTime() + 7))
    const unparsed = await createUnparsedCopyrightEmailIntake(new Date(anchor.getTime() + 8))
    await rejectCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: rejected.id,
      recommendationId: null,
      manualFallbackReason: 'Manual review',
      rationale: 'Not a copyright notice',
    })
    const after = {
      timestamp: anchor.toISOString().replace(/Z$/, '000Z'),
      id: crypto.randomUUID(),
    }

    await expect(searchCopyrightStaffEmailIntakes(viewer, { limit: 2, after })).resolves.toEqual({
      intakes: [],
      hasNextPage: false,
    })
    const { intakes, hasNextPage } = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 2,
      after,
    })
    expect(intakes.map(intake => intake.id)).toEqual([pending.id, second.id])
    expect(hasNextPage).toBe(true)
    expect(intakes).toContainEqual(
      expect.objectContaining({
        id: pending.id,
        parse_status: 'succeeded',
        recommendation_id: null,
        review_path: 'initial',
        linked_notice_id: null,
      }),
    )
    expect(intakes.map(intake => intake.id)).not.toContain(rejected.id)
    const last = intakes.at(-1)!
    const nextPage = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 2,
      after: { timestamp: last.cursor_received_at, id: last.id },
    })
    expect(nextPage.intakes.map(intake => intake.id)).toEqual([third.id, unparsed.id])
    expect(nextPage.intakes[1]).toMatchObject({ parse_status: 'unparsed', review_path: 'initial' })
    expect(nextPage.hasNextPage).toBe(false)
  }, 240_000)
})
