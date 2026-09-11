import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReportsForTarget,
} from '@voucha/test-helpers'
import crypto from 'node:crypto'
import type { PrivateUser } from '@services/users/types'
import { type PendingReportEntity, streamEntitiesWithPendingReportsBatches } from './backfill.mts'
import { MASS_REPORT_THRESHOLD } from './config.mts'

async function collectAll(
  gen: AsyncGenerator<PendingReportEntity[], void, unknown>,
): Promise<PendingReportEntity[]> {
  const results: PendingReportEntity[] = []
  for await (const batch of gen) {
    results.push(...batch)
  }
  return results
}

describe('streamEntitiesWithPendingReportsBatches', () => {
  let author: PrivateUser

  beforeAll(async () => {
    author = await createTestUser()
  })

  it('includes a post entity with >= MASS_REPORT_THRESHOLD distinct reporters in window', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-integrity-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Integrity Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'post',
      entityId: postId,
    })

    const results = await collectAll(streamEntitiesWithPendingReportsBatches())
    const found = results.find(r => r.entityId === postId)
    expect(found).toBeDefined()
    expect(found!.entityType).toBe('post')
  })

  it('excludes a post entity with fewer than MASS_REPORT_THRESHOLD reporters', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-integrity-few-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Integrity Few ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD - 1 }, () => createTestUser().then(u => u!.id)),
    )
    await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'post',
      entityId: postId,
    })

    const results = await collectAll(streamEntitiesWithPendingReportsBatches())
    const found = results.find(r => r.entityId === postId)
    expect(found).toBeUndefined()
  })

  it('excludes reports outside the 60-minute window', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-integrity-old-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Integrity Old ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'post',
      entityId: postId,
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    })
    expect(reportIds.length).toBe(MASS_REPORT_THRESHOLD)

    const results = await collectAll(streamEntitiesWithPendingReportsBatches())
    const found = results.find(r => r.entityId === postId)
    expect(found).toBeUndefined()
  })

  it('returns entity_type comment for comment posts', async () => {
    const rootPostId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-integrity-root-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Integrity Root ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'root body',
    })
    const commentId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-integrity-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Integrity Comment ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'comment body',
      postType: 'comment',
      rootId: rootPostId,
      parentId: rootPostId,
    })
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'comment',
      entityId: commentId,
    })

    const results = await collectAll(streamEntitiesWithPendingReportsBatches())
    const found = results.find(r => r.entityId === commentId)
    expect(found).toBeDefined()
    expect(found!.entityType).toBe('comment')
  })
})
