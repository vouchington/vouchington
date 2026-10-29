import type { FiniteValue } from '@data-stores/psql/finite-values/index'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  clearTestModerationAppealResolution,
  acquireTestModerationTransparencyCohortLock,
  createTestUser,
  deleteTestReleasedModerationTransparencyRollup,
  deleteTestModerationAppeal,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestModerationAppeal,
  insertTestModeratorAction,
  insertTestUserWarning,
  resolveTestModerationAppeal,
  updateTestReleasedModerationTransparencyRollup,
  updateTestModeratorActionType,
} from '@voucha/test-helpers'
import { getModerationTransparency } from './get-moderation-transparency.mts'
import { observeTestModerationTransparencyRollupRelease } from '@voucha/test-helpers/moderation-transparency-rollup-observer'

describe('moderation transparency daily rollup lifecycle', () => {
  it('rejects a released appeal resolution rewrite', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const staff = await createTestUser()
    const appeals = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const appellant = await createTestUser()
        const warning = await insertTestUserWarning({ userId: appellant.id, issuedById: staff.id })
        return insertTestModerationAppeal({ appellantId: appellant.id, userWarningId: warning.id })
      }),
    )
    await Promise.all(
      appeals.map(appeal =>
        resolveTestModerationAppeal({
          appealId: appeal.id,
          resolvedAt: occurredAt,
          resolutionAction: 'accept',
        }),
      ),
    )
    await expectReleasedBucket(now, occurredAt, 'appeals', 'accept')
    const releasedCohort = { occurredAt, metric: 'appeals', category: 'accept' } as const
    await expect(updateTestReleasedModerationTransparencyRollup(releasedCohort)).rejects.toThrow(
      'moderation_transparency_released_daily_rollups rows are append-only',
    )
    await expect(deleteTestReleasedModerationTransparencyRollup(releasedCohort)).rejects.toThrow(
      'moderation_transparency_released_daily_rollups rows are append-only',
    )

    await expect(clearTestModerationAppealResolution(appeals[0]!.id)).rejects.toThrow(
      'moderation appeal resolution is immutable once set',
    )
    await expectReleasedBucket(now, occurredAt, 'appeals', 'accept')
    await expect(
      resolveTestModerationAppeal({
        appealId: appeals[0]!.id,
        resolvedAt: occurredAt,
        resolutionAction: 'deny',
      }),
    ).rejects.toThrow('moderation appeal resolution is immutable once set')
    await expectReleasedBucket(now, occurredAt, 'appeals', 'accept')
  })

  it('keeps a released appeal cohort after source deletion', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const staff = await createTestUser()
    const appeals = await Promise.all(
      Array.from({ length: 20 }, async () => {
        const appellant = await createTestUser()
        const warning = await insertTestUserWarning({ userId: appellant.id, issuedById: staff.id })
        return insertTestModerationAppeal({ appellantId: appellant.id, userWarningId: warning.id })
      }),
    )
    await Promise.all(
      appeals.map(appeal =>
        resolveTestModerationAppeal({
          appealId: appeal.id,
          resolvedAt: occurredAt,
          resolutionAction: 'accept',
        }),
      ),
    )
    await expectReleasedBucket(now, occurredAt, 'appeals', 'accept')
    await deleteTestModerationAppeal(appeals[0]!.id)
    await expectReleasedBucket(now, occurredAt, 'appeals', 'accept')
  })

  it('rejects a released moderator-action reclassification', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const actor = await createTestUser()
    const actions = await Promise.all(
      Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestModeratorAction({
          actorId: actor.id,
          actionType: 'pin',
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )
    await expectReleasedBucket(now, occurredAt, 'moderation_actions', 'pin')
    await expect(updateTestModeratorActionType(actions[0]!.id, 'warn')).rejects.toThrow(
      'moderator_actions rows are append-only',
    )
    await expectReleasedBucket(now, occurredAt, 'moderation_actions', 'pin')
  })

  it('releases independent cohorts while an earlier cohort lock remains held', async () => {
    const now = await uniqueTransparencyNow()
    const actor = await createTestUser()
    const firstOccurredAt = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000)
    const secondOccurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    await Promise.all(
      [firstOccurredAt, secondOccurredAt].flatMap((occurredAt, dayIndex) =>
        Array.from({ length: 20 }, (_, occurredAtSequence) =>
          insertTestModeratorAction({
            actorId: actor.id,
            actionType: dayIndex === 0 ? 'pin' : 'warn',
            occurredAt,
            occurredAtSequence,
          }),
        ),
      ),
    )
    const lock = await acquireTestModerationTransparencyCohortLock({
      occurredAt: firstOccurredAt,
      metric: 'moderation_actions',
      category: 'pin',
    })
    const release = observeTestModerationTransparencyRollupRelease(
      { occurredAt: secondOccurredAt, metric: 'moderation_actions', category: 'warn' },
      () => getModerationTransparency('7d', now),
    )
    onTestFinished(async () => {
      await lock.release()
      await release.result
    })
    try {
      await release.released
      await expect(
        getTestReleasedModerationTransparencyRollupCount({
          occurredAt: secondOccurredAt,
          metric: 'moderation_actions',
          category: 'warn',
        }),
      ).resolves.toBe(20)
      await expect(
        getTestReleasedModerationTransparencyRollupCount({
          occurredAt: firstOccurredAt,
          metric: 'moderation_actions',
          category: 'pin',
        }),
      ).resolves.toBeUndefined()
    } finally {
      await lock.release()
      await release.result
    }
  })
})

async function expectReleasedBucket(
  now: Date,
  occurredAt: Date,
  metric: 'appeals' | 'automated_moderation' | 'moderation_actions',
  category: FiniteValue<'moderation_transparency_categories'>,
): Promise<void> {
  await expect(getModerationTransparency('7d', now)).resolves.toMatchObject({
    buckets: expect.arrayContaining([
      {
        date: occurredAt.toISOString().slice(0, 10),
        metric,
        category,
        count: 20,
      },
    ]),
  })
}

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
