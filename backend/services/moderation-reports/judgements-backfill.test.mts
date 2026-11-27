import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestReportJudgement,
  markTestPostDeletedBy,
} from '@voucha/test-helpers'
import { resolveTestModerationReports } from '@voucha/test-helpers/entities/moderation-report-clusters'
import crypto from 'node:crypto'
import { listMissingReportJudgementPage } from './judgement-backfill-page.mts'

async function readTarget(kind: 'post' | 'user', targetId: string) {
  const signedId = BigInt(`0x${targetId.replaceAll('-', '')}`)
  const bound = (value: bigint) => {
    const hex = value.toString(16).padStart(32, '0')
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return (
    await listMissingReportJudgementPage(kind, bound(signedId - 1n), bound(signedId + 1n), 1, 1)
  ).entities
}

describe('listMissingReportJudgementPage', () => {
  it('excludes a post entity that already has a judgement', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-judged-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Judged Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
    })

    expect(await readTarget('post', postId)).toEqual([])
  })

  it('returns entity_type comment for posts with post_type=comment', async () => {
    const author = await createTestUser()
    const reporter = await createTestUser()
    const rootPostId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-root-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Root ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'root body',
    })
    const commentId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Comment ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'comment',
      entityId: commentId,
    })

    expect(await readTarget('post', commentId)).toEqual([
      { entityId: commentId, entityType: 'comment', triggeringReportId: reportId },
    ])
  })

  it('returns the newest report even when it has been resolved', async () => {
    const author = await createTestUser()
    const reporter1 = await createTestUser()
    const reporter2 = await createTestUser()
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-trigger-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Trigger Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    // Insert two reports sequentially; the second is inserted later and thus newer
    await insertTestModerationReport({
      reporterUserId: reporter1.id,
      entityType: 'post',
      entityId: postId,
    })
    const latestReportId = await insertTestModerationReport({
      reporterUserId: reporter2.id,
      entityType: 'post',
      entityId: postId,
    })

    await resolveTestModerationReports([latestReportId], 'actioned')
    expect(await readTarget('post', postId)).toEqual([
      { entityId: postId, entityType: 'post', triggeringReportId: latestReportId },
    ])

    await markTestPostDeletedBy(postId, author.id)
    expect(await readTarget('post', postId)).toEqual([])
  })

  it('keeps the newest resolved report for a live post and skips a deleted post', async () => {
    const [author, reporter, newerReporter] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const [livePostId, deletedPostId] = await Promise.all([
      insertTestPost({
        createdById: author.id,
        slug: `backfill-live-${crypto.randomUUID()}`,
        title: 'Live Backfill Post',
        markdown: 'body',
      }),
      insertTestPost({
        createdById: author.id,
        slug: `backfill-deleted-${crypto.randomUUID()}`,
        title: 'Deleted Backfill Post',
        markdown: 'body',
      }),
    ])
    const newestReportId = await insertTestModerationReport({
      reporterUserId: newerReporter.id,
      entityType: 'post',
      entityId: livePostId,
      createdAt: new Date(Date.UTC(2026, 2, 2)),
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: livePostId,
      createdAt: new Date(Date.UTC(2026, 2, 1)),
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: deletedPostId,
    })
    await Promise.all([
      resolveTestModerationReports([newestReportId], 'reviewed'),
      markTestPostDeletedBy(deletedPostId, author.id),
    ])

    const [live, deleted] = await Promise.all([
      readTarget('post', livePostId),
      readTarget('post', deletedPostId),
    ])
    expect(live).toEqual([
      { entityType: 'post', entityId: livePostId, triggeringReportId: newestReportId },
    ])
    expect(deleted).toEqual([])
  })

  it('includes a user entity with a report and no judgement', async () => {
    const targetUser = await createTestUser()
    const reporter = await createTestUser()
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: targetUser.id,
    })

    expect(await readTarget('user', targetUser.id)).toEqual([
      { entityId: targetUser.id, entityType: 'user', triggeringReportId: reportId },
    ])
  })
})
