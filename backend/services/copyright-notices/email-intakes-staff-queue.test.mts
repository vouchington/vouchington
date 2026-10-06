import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { rejectCopyrightEmailIntake } from './email-rejection.mts'
import { searchCopyrightStaffEmailIntakes } from './read-models-staff-email-intakes.mts'
import {
  createParsedCopyrightEmailIntake,
  createUnparsedCopyrightEmailIntake,
} from '@voucha/test-helpers/copyright-email-intake-fixtures'

describe('searchCopyrightStaffEmailIntakes', () => {
  it('hides the queue from non-reviewers and lists unreviewed intakes, parsed or not, for staff', async () => {
    const anchor = Date.now()
    const at = (offset: number) => new Date(anchor + offset)
    const [viewer, moderator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const pending = await createParsedCopyrightEmailIntake(at(0))
    const foreign = await createParsedCopyrightEmailIntake(at(1))
    const second = await createParsedCopyrightEmailIntake(at(2))
    const third = await createParsedCopyrightEmailIntake(at(4))
    const rejected = await createParsedCopyrightEmailIntake(at(6))
    const unparsed = await createUnparsedCopyrightEmailIntake(at(8))
    await rejectCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: rejected.id,
      recommendationId: null,
      manualFallbackReason: 'Manual review',
      rationale: 'Not a copyright notice',
    })
    const intakeIds = [pending.id, second.id, third.id, rejected.id, unparsed.id]
    const after = {
      timestamp: at(-1).toISOString().replace(/Z$/, '000Z'),
      id: crypto.randomUUID(),
    }

    await expect(
      searchCopyrightStaffEmailIntakes(viewer, { limit: 2, after, intakeIds }),
    ).resolves.toEqual({ intakes: [], hasNextPage: false })
    const { intakes, hasNextPage } = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 2,
      after,
      intakeIds,
    })
    expect(intakes.map(intake => intake.id)).toEqual([pending.id, second.id])
    expect(intakes.map(intake => intake.id)).not.toContain(foreign.id)
    expect(intakes.map(intake => intake.id)).not.toContain(rejected.id)
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
    const last = intakes.at(-1)!
    const nextPage = await searchCopyrightStaffEmailIntakes(moderator, {
      limit: 2,
      intakeIds,
      after: { timestamp: last.cursor_received_at, id: last.id },
    })
    expect(nextPage.intakes.map(intake => intake.id)).toEqual([third.id, unparsed.id])
    expect(nextPage.intakes.map(intake => intake.id)).not.toContain(foreign.id)
    expect(nextPage.intakes[1]).toMatchObject({ parse_status: 'unparsed', review_path: 'initial' })
    expect(nextPage.hasNextPage).toBe(false)
  })
})
