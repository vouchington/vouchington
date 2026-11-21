import crypto from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  acquireTestModerationTransparencyDateReservation,
  createTestUser,
  getTestReleasedModerationTransparencyRollupCount,
  insertTestModerationReportsForTarget,
  insertTestPost,
  updateTestModerationReportOriginalReason,
} from '@voucha/test-helpers'
import { releaseTestDay } from './release-test-window.mts'

describe('moderation transparency report immutability', () => {
  it('rejects original-reason mutation without moving its released rollup', async () => {
    const occurredAt = await uniqueTransparencyNow()
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: `Immutable report reason ${crypto.randomUUID()}`,
      slug: `immutable-report-reason-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'test',
    })
    const reporters = await Promise.all(Array.from({ length: 20 }, () => createTestUser()))
    const ids = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters.map(reporter => reporter!.id),
      entityType: 'post',
      entityId: postId,
      createdAt: occurredAt,
    })

    await expect(updateTestModerationReportOriginalReason(ids[0]!, 'harassment')).rejects.toThrow(
      'moderation_reports rows are append-only',
    )
    await releaseTestDay(occurredAt)
    await expect(
      getTestReleasedModerationTransparencyRollupCount({
        occurredAt,
        metric: 'reports',
        category: 'spam',
      }),
    ).resolves.toBe(20)
    await expect(
      getTestReleasedModerationTransparencyRollupCount({
        occurredAt,
        metric: 'reports',
        category: 'harassment',
      }),
    ).resolves.toBeUndefined()
  })
})

async function uniqueTransparencyNow(): Promise<Date> {
  const reservation = await acquireTestModerationTransparencyDateReservation()
  onTestFinished(() => reservation.release())
  return reservation.now
}
