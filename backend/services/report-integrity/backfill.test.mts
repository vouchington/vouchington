import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReportsForTarget,
  insertTestUrlHostname,
  createTestRssFeedItemWithUrl,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import crypto from 'node:crypto'
import type { PrivateUser } from '@services/users/types'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { type PendingReportEntity, listPendingReportEntityPage } from './backfill.mts'
import { MASS_REPORT_THRESHOLD } from './config.mts'
import { reportIntegrityWorkConfig } from './work-limits.mts'

async function collectAll(now: number, reportIds: string[]): Promise<PendingReportEntity[]> {
  const results: PendingReportEntity[] = []
  let cursor: string | undefined
  for (let pageIndex = 0; pageIndex <= reportIds.length; pageIndex++) {
    const page = await listPendingReportEntityPage(now, cursor, reportIds)
    results.push(...page.entities)
    cursor = page.nextCursor ?? undefined
    if (!cursor) break
  }
  return results
}

describe('listPendingReportEntityPage', () => {
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
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'post',
      entityId: postId,
    })

    const results = await collectAll(Date.now(), reportIds)
    const found = results.find(r => r.entityId === postId)
    expect(found).toBeDefined()
    expect(found!.entityType).toBe('post')
  })

  it('discovers a below-threshold subject for the exact detector to evaluate', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `backfill-integrity-few-${crypto.randomUUID().slice(0, 8)}`,
      title: `Backfill Integrity Few ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD - 1 }, () => createTestUser().then(u => u!.id)),
    )
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'post',
      entityId: postId,
    })

    const results = await collectAll(Date.now(), reportIds)
    const found = results.find(r => r.entityId === postId)
    expect(found).toEqual({ entityType: 'post', entityId: postId })
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

    const results = await collectAll(Date.now(), reportIds)
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
    const reportIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'comment',
      entityId: commentId,
    })

    const results = await collectAll(Date.now(), reportIds)
    const found = results.find(r => r.entityId === commentId)
    expect(found).toBeDefined()
    expect(found!.entityType).toBe('comment')
  })

  it('advances by inspected report id and deduplicates each page without losing later subjects', async () => {
    const reporters = await Promise.all(Array.from({ length: 3 }, () => createTestUser()))
    const targets = await Promise.all([createTestUser(), createTestUser()])
    const firstIds = await insertTestModerationReportsForTarget({
      reporterUserIds: reporters.map(user => user.id),
      entityType: 'user',
      entityId: targets[0]!.id,
    })
    const lastIds = await insertTestModerationReportsForTarget({
      reporterUserIds: [reporters[0]!.id],
      entityType: 'user',
      entityId: targets[1]!.id,
    })
    const reportIds = [...firstIds, ...lastIds].toSorted()
    const restore = overrideDynamicConfigFieldsForTest(reportIntegrityWorkConfig, {
      backfill_batch_size: 2,
    })
    try {
      const now = Date.now()
      const first = await listPendingReportEntityPage(now, undefined, reportIds)
      expect(first).toEqual({
        entities: [{ entityType: 'user', entityId: targets[0]!.id }],
        nextCursor: reportIds[1],
      })
      const next = await listPendingReportEntityPage(now, first.nextCursor!, reportIds)
      expect(next.entities).toEqual(
        targets.map(user => ({ entityType: 'user', entityId: user.id })),
      )
      expect(next.nextCursor).toBe(reportIds[3])
      expect(await listPendingReportEntityPage(now, next.nextCursor!, reportIds)).toEqual({
        entities: [],
        nextCursor: null,
      })
    } finally {
      restore()
    }
  })

  it('scopes discovery to owned reports while leaving an equally eligible report excluded', async () => {
    const reporter = await createTestUser()
    const targets = await Promise.all([createTestUser(), createTestUser()])
    const owned = await insertTestModerationReportsForTarget({
      reporterUserIds: [reporter.id],
      entityType: 'user',
      entityId: targets[0]!.id,
    })
    await insertTestModerationReportsForTarget({
      reporterUserIds: [reporter.id],
      entityType: 'user',
      entityId: targets[1]!.id,
    })
    expect(await listPendingReportEntityPage(Date.now(), undefined, owned)).toEqual({
      entities: [{ entityType: 'user', entityId: targets[0]!.id }],
      nextCursor: null,
    })
  })

  it('includes the exact one-hour cutoff and excludes the next millisecond across UTC calendar boundaries', async () => {
    const reporterUserIds = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    const cases: Array<{
      entityType: 'post' | 'comment' | 'user' | 'url_hostname' | 'rss_feed_item'
      referenceNow: string
    }> = [
      { entityType: 'post', referenceNow: '2026-02-01T00:30:00.000Z' },
      { entityType: 'comment', referenceNow: '2024-03-01T00:30:00.000Z' },
      { entityType: 'user', referenceNow: '2025-01-01T00:30:00.000Z' },
      { entityType: 'url_hostname', referenceNow: '2026-02-01T00:30:00.000Z' },
      { entityType: 'rss_feed_item', referenceNow: '2024-03-01T00:30:00.000Z' },
    ]

    for (const { entityType, referenceNow } of cases) {
      let entityId: string
      if (entityType === 'post') {
        entityId = await insertTestPost({
          createdById: author.id,
          slug: `backfill-cutoff-post-${crypto.randomUUID().slice(0, 8)}`,
          title: 'Backfill cutoff post',
          markdown: 'body',
        })
      } else if (entityType === 'comment') {
        const rootPostId = await insertTestPost({
          createdById: author.id,
          slug: `backfill-cutoff-root-${crypto.randomUUID().slice(0, 8)}`,
          title: 'Backfill cutoff root',
          markdown: 'root body',
        })
        entityId = await insertTestPost({
          createdById: author.id,
          slug: `backfill-cutoff-comment-${crypto.randomUUID().slice(0, 8)}`,
          title: 'Backfill cutoff comment',
          markdown: 'comment body',
          postType: 'comment',
          rootId: rootPostId,
          parentId: rootPostId,
        })
      } else if (entityType === 'user') {
        entityId = (await createTestUser()).id
      } else if (entityType === 'url_hostname') {
        entityId = await insertTestUrlHostname({
          hostname: `backfill-cutoff-${crypto.randomUUID().slice(0, 8)}.example.com`,
        })
      } else {
        const feed = await createTestRssFeed({})
        entityId = (await createTestRssFeedItemWithUrl(feed.id)).id
      }

      const referenceNowMs = new Date(referenceNow).getTime()
      const reportAt = new Date(referenceNowMs - 60 * 60 * 1000)
      const reportIds = await insertTestModerationReportsForTarget({
        reporterUserIds,
        entityType,
        entityId,
        createdAt: reportAt,
      })

      for (const offsetMs of [-1, 0, 1]) {
        const now = referenceNowMs + offsetMs
        const page = await listPendingReportEntityPage(now, undefined, reportIds)
        expect(page.entities).toEqual(offsetMs <= 0 ? [{ entityType, entityId }] : [])
        expect(page.nextCursor).toBeNull()
      }
    }
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects non-finite now value %s', async now => {
    await expect(listPendingReportEntityPage(now)).rejects.toThrow('now must be a finite number')
  })
})
