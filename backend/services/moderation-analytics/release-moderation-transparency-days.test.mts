import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  deleteTestModeratorActions,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestModeratorAction,
} from '@voucha/test-helpers'
import { releaseModerationTransparencyDays } from './release-moderation-transparency-days.mts'

const DAY_MS = 24 * 60 * 60 * 1000

describe('releaseModerationTransparencyDays', () => {
  it('releases only closed cohorts of at least twenty, once, from the rows that still exist', async () => {
    const reservation = await acquireTestModerationTransparencyDateReservation()
    onTestFinished(() => reservation.release())
    const now = reservation.now
    const closedDay = new Date(now.getTime() - 3 * DAY_MS)
    const openDay = new Date(now.getTime() - DAY_MS)
    const actor = await createTestUser()
    const insert = (
      actionType: 'approve' | 'warn' | 'lock' | 'pin',
      occurredAt: Date,
      count: number,
      start = 0,
    ) =>
      Promise.all(
        Array.from({ length: count }, (_, sequence) =>
          insertTestModeratorAction({
            actorId: actor.id,
            actionType,
            occurredAt,
            occurredAtSequence: start + sequence,
          }),
        ),
      )
    const read = (occurredAt: Date, category: 'approve' | 'warn' | 'lock' | 'pin') =>
      getTestReleasedModerationTransparencyRollupCount({
        occurredAt,
        metric: 'moderation_actions',
        category,
      })

    await insert('approve', closedDay, 20)
    await insert('warn', closedDay, 19)
    const deletedBeforeRelease = await insert('lock', closedDay, 21)
    await deleteTestModeratorActions(deletedBeforeRelease.slice(0, 2).map(action => action.id))
    await insert('pin', openDay, 20)

    await expect(releaseModerationTransparencyDays(now)).resolves.toMatchObject({
      days: 7,
      released: 1,
    })
    await expect(read(closedDay, 'approve')).resolves.toBe(20)
    await expect(read(closedDay, 'warn')).resolves.toBeUndefined()
    await expect(read(closedDay, 'lock')).resolves.toBeUndefined()
    await expect(read(openDay, 'pin')).resolves.toBeUndefined()

    await insert('approve', closedDay, 1, 100)
    await expect(releaseModerationTransparencyDays(now)).resolves.toMatchObject({ released: 0 })
    await expect(read(closedDay, 'approve')).resolves.toBe(20)

    await expect(
      releaseModerationTransparencyDays(new Date(now.getTime() + 2 * DAY_MS)),
    ).resolves.toMatchObject({ released: 1 })
    await expect(read(openDay, 'pin')).resolves.toBe(20)
  })
})
