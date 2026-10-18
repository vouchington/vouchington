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
import { uuidBefore } from '@voucha/test-helpers/uuid-before'
import { type PendingReportEntity, listPendingReportEntityPage } from './backfill.mts'
import { MASS_REPORT_THRESHOLD } from './config.mts'
import { reportIntegrityWorkConfig } from './work-limits.mts'

async function collectAll(now: number): Promise<PendingReportEntity[]> {
  const results: PendingReportEntity[] = []
  let cursor: string | undefined
  do {
    const page = await listPendingReportEntityPage(now, cursor)
    results.push(...page.entities)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
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
    await insertTestModerationReportsForTarget({
      reporterUserIds: reporters,
      entityType: 'post',
      entityId: postId,
    })

    const results = await collectAll(Date.now())
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

    const results = await collectAll(Date.now())
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

    const results = await collectAll(Date.now())
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

    const results = await collectAll(Date.now())
    const found = results.find(r => r.entityId === commentId)
    expect(found).toBeDefined()
    expect(found!.entityType).toBe('comment')
  })

  it('pages in id order: a page never exceeds the size, a full page names its last id, each entity appears once', async () => {
    const pageSize = 2
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    const targets = await Promise.all(
      Array.from({ length: 3 }, () => createTestUser().then(u => u!.id)),
    )
    for (const entityId of targets) {
      await insertTestModerationReportsForTarget({
        reporterUserIds: reporters,
        entityType: 'user',
        entityId,
      })
    }
    const mine = new Set(targets)
    const restore = overrideDynamicConfigFieldsForTest(reportIntegrityWorkConfig, {
      backfill_batch_size: pageSize,
    })
    try {
      const seen = new Map<string, number>()
      let cursor: string | undefined = uuidBefore(targets.toSorted()[0]!)
      const walked: string[] = []
      const now = Date.now()
      while (cursor) {
        const page = await listPendingReportEntityPage(now, cursor)
        const ids = page.entities.map(entity => entity.entityId)
        expect(ids.length).toBeLessThanOrEqual(pageSize)
        expect(page.nextCursor).toBe(ids.length === pageSize ? (ids.at(-1) ?? null) : null)
        walked.push(...ids)
        for (const id of ids) if (mine.has(id)) seen.set(id, (seen.get(id) ?? 0) + 1)
        cursor = page.nextCursor ?? undefined
      }
      // Pages arrive in strictly ascending id order, so no id repeats across a cursor boundary.
      expect(walked).toEqual([...new Set(walked)].toSorted())
      expect([...seen.keys()].toSorted()).toEqual(targets.toSorted())
      expect([...seen.values()].every(count => count === 1)).toBe(true)
    } finally {
      restore()
    }
  })

  it('narrows a page to the known entity', async () => {
    const reporters = await Promise.all(
      Array.from({ length: MASS_REPORT_THRESHOLD }, () => createTestUser().then(u => u!.id)),
    )
    const [target, other] = await Promise.all([createTestUser(), createTestUser()])
    for (const entityId of [target!.id, other!.id]) {
      await insertTestModerationReportsForTarget({
        reporterUserIds: reporters,
        entityType: 'user',
        entityId,
      })
    }

    const page = await listPendingReportEntityPage(Date.now(), undefined, {
      entityType: 'user',
      entityId: target!.id,
    })

    expect(page).toEqual({
      entities: [{ entityType: 'user', entityId: target!.id }],
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
      { entityType: 'comment', referenceNow: '2028-03-01T00:30:00.000Z' },
      { entityType: 'user', referenceNow: '2025-01-01T00:30:00.000Z' },
      { entityType: 'url_hostname', referenceNow: '2026-02-01T00:30:00.000Z' },
      { entityType: 'rss_feed_item', referenceNow: '2028-03-01T00:30:00.000Z' },
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
      await insertTestModerationReportsForTarget({
        reporterUserIds,
        entityType,
        entityId,
        createdAt: reportAt,
      })

      for (const offsetMs of [-1, 0, 1]) {
        const now = referenceNowMs + offsetMs
        const page = await listPendingReportEntityPage(now, undefined, { entityType, entityId })
        expect(page.entities).toEqual(offsetMs <= 0 ? [{ entityType, entityId }] : [])
        expect(page.nextCursor).toBeNull()
      }
    }
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects non-finite now value %s', async now => {
    await expect(listPendingReportEntityPage(now)).rejects.toThrow('now must be a finite number')
  })
})
