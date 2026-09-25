import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { rejectCopyrightEmailIntake, searchCopyrightStaffEmailIntakes } from './index.mts'
import { createParsedCopyrightEmailIntake } from './email-intake-test-fixtures.mts'

describe('searchCopyrightStaffEmailIntakes', () => {
  it('hides the queue from non-reviewers and lists unreviewed parsed intakes for staff', async () => {
    const [viewer, moderatorRecord] = await Promise.all([createTestUser(), createTestUser()])
    const moderator = { ...moderatorRecord, roles: ['moderator'] } as typeof moderatorRecord
    const receivedAt = new Date()
    const pending = await createParsedCopyrightEmailIntake(receivedAt)
    const rejected = await createParsedCopyrightEmailIntake(new Date(receivedAt.getTime() + 1))
    await rejectCopyrightEmailIntake({
      currentUser: moderator,
      intakeId: rejected.id,
      recommendationId: null,
      manualFallbackReason: 'Manual review',
      rationale: 'Not a copyright notice',
    })
    // The queue is global and oldest-first, so seek just before this test's own intakes.
    const after = {
      timestamp: new Date(receivedAt.getTime() - 1).toISOString().replace(/Z$/, '000Z'),
      id: crypto.randomUUID(),
    }

    await expect(searchCopyrightStaffEmailIntakes(viewer, { limit: 100, after })).resolves.toEqual({
      intakes: [],
      hasNextPage: false,
    })
    const { intakes } = await searchCopyrightStaffEmailIntakes(moderator, { limit: 100, after })
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
  })
})
