import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  deleteTestModeratorActions,
  insertTestModeratorAction,
} from '@voucha/test-helpers'
import { getModerationTransparency } from './get-moderation-transparency.mts'

describe('getModerationTransparency complete UTC-day release boundary', () => {
  it('withholds a partial UTC daily cohort until the entire day has passed the release delay', async () => {
    const now = await uniqueTransparencyNow()
    const partialDay = new Date(now.getTime() - 48 * 60 * 60 * 1000)
    const moderator = await createTestUser()

    await Promise.all(
      Array.from({ length: 25 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'approve',
          occurredAt: new Date(partialDay.getTime() + occurredAtSequence * 60 * 1000),
          occurredAtSequence,
        }),
      ),
    )

    await expect(getModerationTransparency('all', now)).resolves.not.toMatchObject({
      buckets: expect.arrayContaining([
        expect.objectContaining({
          date: `${partialDay.toISOString().slice(0, 7)}-01`,
          metric: 'moderation_actions',
          category: 'approve',
        }),
      ]),
    })
    await expect(
      getModerationTransparency('all', new Date(now.getTime() + 12 * 60 * 60 * 1000)),
    ).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        {
          date: `${partialDay.toISOString().slice(0, 7)}-01`,
          metric: 'moderation_actions',
          category: 'approve',
          count: 25,
        },
      ]),
    })
  })

  it('retains an already released aggregate after its source actions are hard deleted', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const moderator = await createTestUser()
    const actions = await Promise.all(
      Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: moderator.id,
          actionType: 'approve',
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )

    await expect(getModerationTransparency('all', now)).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        {
          date: `${occurredAt.toISOString().slice(0, 7)}-01`,
          metric: 'moderation_actions',
          category: 'approve',
          count: 20,
        },
      ]),
    })
    await deleteTestModeratorActions(actions.map(action => action.id))

    await expect(getModerationTransparency('all', now)).resolves.toMatchObject({
      buckets: expect.arrayContaining([
        {
          date: `${occurredAt.toISOString().slice(0, 7)}-01`,
          metric: 'moderation_actions',
          category: 'approve',
          count: 20,
        },
      ]),
    })
  })
})

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
