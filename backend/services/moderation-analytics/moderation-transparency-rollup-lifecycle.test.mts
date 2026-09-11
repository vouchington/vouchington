import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  clearTestModerationAppealResolution,
  acquireTestModerationTransparencyCohortLock,
  createTestUser,
  deleteTestReleasedModerationTransparencyRollup,
  deleteTestModerationAppeal,
  deleteTestPostClearanceChange,
  getTestModerationTransparencyRollupCount,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestModerationAppeal,
  insertTestPost,
  insertTestPostClearanceChange,
  insertTestModeratorAction,
  insertTestUserWarning,
  resolveTestModerationAppeal,
  updateTestReleasedModerationTransparencyRollup,
  updateTestPostClearanceChange,
  updateTestModeratorActionType,
} from '@voucha/test-helpers'
import { getModerationTransparency } from './get-moderation-transparency.mts'

describe('moderation transparency daily rollup lifecycle', () => {
  it('counts a jointly flagged clearance rejection in both immutable source cohorts', async () => {
    const occurredAt = await uniqueTransparencyNow()
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: `Transparency joint sources ${crypto.randomUUID()}`,
      slug: `transparency-joint-sources-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Test transparency aggregation.',
    })
    await insertTestPostClearanceChange({
      postId,
      status: 'rejected',
      occurredAt,
      moderationTransparencyCategories: ['openai_omni', 'spam_detection'],
    })

    await expectRollupCount(occurredAt, 'automated_moderation', 'openai_omni', 1)
    await expectRollupCount(occurredAt, 'automated_moderation', 'spam_detection', 1)
    await expect(
      getTestModerationTransparencyRollupCount({
        occurredAt,
        metric: 'automated_moderation',
        category: 'post_clearance_reject',
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects a released clearance source reclassification', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: `Transparency clearance lifecycle ${crypto.randomUUID()}`,
      slug: `transparency-clearance-lifecycle-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Test rollup lifecycle aggregation.',
    })
    const changes = await Promise.all(
      Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestPostClearanceChange({
          postId,
          status: 'rejected',
          moderationTransparencyCategories: ['openai_omni'],
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )

    await expectReleasedBucket(now, occurredAt, 'automated_moderation', 'openai_omni')
    await expect(
      updateTestPostClearanceChange({ id: changes[0]!.id, status: 'approved' }),
    ).rejects.toThrow('post clearance change type is immutable')
    await expectReleasedBucket(now, occurredAt, 'automated_moderation', 'openai_omni')
  })

  it('keeps a released clearance cohort after source deletion', async () => {
    const now = await uniqueTransparencyNow()
    const occurredAt = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: `Transparency clearance deletion ${crypto.randomUUID()}`,
      slug: `transparency-clearance-deletion-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Test rollup lifecycle aggregation.',
    })
    const changes = await Promise.all(
      Array.from({ length: 20 }, (_, occurredAtSequence) =>
        insertTestPostClearanceChange({
          postId,
          status: 'rejected',
          moderationTransparencyCategories: ['openai_omni'],
          occurredAt,
          occurredAtSequence,
        }),
      ),
    )
    await expectReleasedBucket(now, occurredAt, 'automated_moderation', 'openai_omni')
    await deleteTestPostClearanceChange(changes[0]!.id)
    await expectReleasedBucket(now, occurredAt, 'automated_moderation', 'openai_omni')
  })

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
    const releasedCohort = { occurredAt, metric: 'appeals', category: 'accept' }
    await expect(updateTestReleasedModerationTransparencyRollup(releasedCohort)).rejects.toThrow(
      'released moderation transparency cohorts are immutable',
    )
    await expect(deleteTestReleasedModerationTransparencyRollup(releasedCohort)).rejects.toThrow(
      'released moderation transparency cohorts are immutable',
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
      'moderator action type is immutable',
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
    const release = getModerationTransparency('7d', now)
    try {
      await expect
        .poll(
          () =>
            getTestReleasedModerationTransparencyRollupCount({
              occurredAt: secondOccurredAt,
              metric: 'moderation_actions',
              category: 'warn',
            }),
          { interval: 20, timeout: 5_000 },
        )
        .toBe(20)
      await expect(
        getTestReleasedModerationTransparencyRollupCount({
          occurredAt: firstOccurredAt,
          metric: 'moderation_actions',
          category: 'pin',
        }),
      ).resolves.toBeUndefined()
    } finally {
      await lock.release()
      await release
    }
  })
})

async function expectReleasedBucket(
  now: Date,
  occurredAt: Date,
  metric: 'appeals' | 'automated_moderation' | 'moderation_actions',
  category: string,
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

async function expectRollupCount(
  occurredAt: Date,
  metric: string,
  category: string,
  expectedCount: number,
): Promise<void> {
  await expect(
    getTestModerationTransparencyRollupCount({ occurredAt, metric, category }),
  ).resolves.toBe(expectedCount)
}

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
