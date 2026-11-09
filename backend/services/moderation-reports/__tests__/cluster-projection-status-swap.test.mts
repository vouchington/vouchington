import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import {
  getTestModerationReportClusters,
  resolveTestModerationReports,
  swapTestModerationReportStatuses,
} from '@voucha/test-helpers/entities/moderation-report-clusters'

describe('moderation report cluster status moves', () => {
  it('moves opposite outcomes concurrently without a projection lock cycle', async () => {
    const [author, firstReporter, secondReporter] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `cluster-status-swap-${crypto.randomUUID()}`,
      title: 'Concurrent status moves',
      markdown: 'body',
    })
    const firstAt = new Date('2003-01-01T00:00:00.000Z')
    const secondAt = new Date('2003-01-01T00:00:01.000Z')
    const pendingId = await insertTestModerationReport({
      reporterUserId: firstReporter.id,
      entityType: 'post',
      entityId: postId,
      createdAt: firstAt,
    })
    const reviewedId = await insertTestModerationReport({
      reporterUserId: secondReporter.id,
      entityType: 'post',
      entityId: postId,
      createdAt: secondAt,
    })
    await resolveTestModerationReports([reviewedId], 'reviewed')

    await swapTestModerationReportStatuses(pendingId, reviewedId)

    expect(await getTestModerationReportClusters('post', postId)).toEqual([
      {
        resolution_action: null,
        first_reported_at: secondAt,
        last_reported_at: secondAt,
        report_count: 1,
      },
      {
        resolution_action: 'reviewed',
        first_reported_at: firstAt,
        last_reported_at: firstAt,
        report_count: 1,
      },
    ])
  })
})
