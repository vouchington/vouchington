import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import {
  deleteTestModerationReports,
  getTestModerationReportClusters,
  resolveTestModerationReports,
} from '@voucha/test-helpers/entities/moderation-report-clusters'
import { hardDeleteTestPost } from '@voucha/test-helpers/entities/posts-deletion'
import { hardDeleteTestUser } from '@voucha/test-helpers/entities/users-lifecycle'

describe('moderation report cluster projection', () => {
  it('keeps status counts and head timestamps exact across concurrent inserts and removals', async () => {
    const [author, firstReporter, secondReporter, thirdReporter] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `cluster-projection-${crypto.randomUUID()}`,
      title: 'Cluster projection target',
      markdown: 'body',
    })
    const firstAt = new Date('2001-01-01T00:00:00.000Z')
    const middleAt = new Date('2001-01-01T00:00:01.000Z')
    const lastAt = new Date('2001-01-01T00:00:02.000Z')
    const firstId = await insertTestModerationReport({
      reporterUserId: firstReporter.id,
      entityType: 'post',
      entityId: postId,
      createdAt: firstAt,
    })
    const [middleId, lastId] = await Promise.all([
      insertTestModerationReport({
        reporterUserId: secondReporter.id,
        entityType: 'post',
        entityId: postId,
        createdAt: middleAt,
      }),
      insertTestModerationReport({
        reporterUserId: thirdReporter.id,
        entityType: 'post',
        entityId: postId,
        createdAt: lastAt,
      }),
    ])

    expect(await getTestModerationReportClusters('post', postId)).toEqual([
      {
        resolution_action: null,
        first_reported_at: firstAt,
        last_reported_at: lastAt,
        report_count: 3,
      },
    ])

    await resolveTestModerationReports([middleId, lastId], 'actioned')
    expect(await getTestModerationReportClusters('post', postId)).toEqual([
      {
        resolution_action: null,
        first_reported_at: firstAt,
        last_reported_at: firstAt,
        report_count: 1,
      },
      {
        resolution_action: 'actioned',
        first_reported_at: middleAt,
        last_reported_at: lastAt,
        report_count: 2,
      },
    ])

    await deleteTestModerationReports([firstId, middleId])
    expect(await getTestModerationReportClusters('post', postId)).toEqual([
      {
        resolution_action: 'actioned',
        first_reported_at: lastAt,
        last_reported_at: lastAt,
        report_count: 1,
      },
    ])
    await deleteTestModerationReports([lastId])
    expect(await getTestModerationReportClusters('post', postId)).toEqual([])
  })

  it('removes a cluster when its target is hard deleted', async () => {
    const [author, reporter] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `cluster-cascade-${crypto.randomUUID()}`,
      title: 'Cluster cascade target',
      markdown: 'body',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    expect(await getTestModerationReportClusters('post', postId)).toHaveLength(1)
    await hardDeleteTestPost(postId)
    expect(await getTestModerationReportClusters('post', postId)).toEqual([])
  })

  it('removes the last report cluster when the reporter is hard deleted', async () => {
    const [author, reporter] = await Promise.all([createTestUser(), createTestUser()])
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `cluster-reporter-cascade-${crypto.randomUUID()}`,
      title: 'Reporter cascade target',
      markdown: 'body',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    expect(await getTestModerationReportClusters('post', postId)).toHaveLength(1)
    await hardDeleteTestUser(reporter.id)
    expect(await getTestModerationReportClusters('post', postId)).toEqual([])
  })
})
