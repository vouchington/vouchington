import { postsWorkConfig } from '@services/posts/work-limits'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { observeTestPostgresQueryPools } from '@voucha/test-helpers/postgres-query-pool-observer'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { archivePost } from '../archive.mts'
import { auditReviewSuccessionHistory } from './audit.mts'
import { reconcileReviewSuccessionsForPostIds } from './reconcile.mts'

describe('review succession history audit', () => {
  it('fixes a database cutoff on the first page and reuses it for continuations', async () => {
    const first = await auditReviewSuccessionHistory({ cursor: null, cutoffArchivedAt: null })
    const second = await auditReviewSuccessionHistory({
      cursor: first.cursor,
      cutoffArchivedAt: first.cutoffArchivedAt,
    })

    expect(first.cutoffArchivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(second.cutoffArchivedAt).toBe(first.cutoffArchivedAt)
  })

  it('classifies a matching automatic archive epoch by timestamp value without writes', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Expected review succession audit author fixture')
    const suffix = randomUUID().replaceAll('-', '')
    const idPrefix = `ffffffff-ffff-7fff-bfff-${suffix.slice(0, 11)}`
    const predecessorId = `${idPrefix}1`
    const successorId = `${idPrefix}2`
    const cursor = `${idPrefix}0`
    const topicId = await insertTestTopic({
      name: `Review succession audit ${suffix}`,
      slug: `review-succession-audit-${suffix}`,
      createdById: author.id,
    })
    await insertTestPost({
      id: predecessorId,
      title: `Review succession predecessor ${suffix}`,
      slug: `review-succession-predecessor-${suffix}`,
      markdown: 'Historical review succession audit predecessor fixture.',
      createdById: author.id,
      postType: 'review',
    })
    await insertTestPost({
      id: successorId,
      title: `Review succession successor ${suffix}`,
      slug: `review-succession-successor-${suffix}`,
      markdown: 'Historical review succession audit successor fixture.',
      createdById: author.id,
      postType: 'review',
    })
    await Promise.all([
      insertTestPostReview(predecessorId, topicId),
      insertTestPostReview(successorId, topicId),
    ])
    await reconcileReviewSuccessionsForPostIds([successorId])

    const result = await auditReviewSuccessionHistory({ cursor, cutoffArchivedAt: null })

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          postId: predecessorId,
          classification: 'active_automatic',
          currentAuthorUserId: author.id,
          currentTopicIds: [topicId],
          currentArchivedAt: expect.any(Date),
        }),
      ]),
    )
  })

  it('returns an empty page after the maximum UUIDv7 cursor', async () => {
    const result = await auditReviewSuccessionHistory({
      cursor: 'ffffffff-ffff-7fff-bfff-ffffffffffff',
      cutoffArchivedAt: null,
    })

    expect(result).toMatchObject({ findings: [], cursor: null, hasMore: false })
  })

  it('rejects malformed audit cursors and cutoffs before querying archive history', async () => {
    await expect(
      auditReviewSuccessionHistory({ cursor: 'not-a-uuid', cutoffArchivedAt: null }),
    ).rejects.toThrow('cursor must be a UUID')
    await expect(
      auditReviewSuccessionHistory({ cursor: null, cutoffArchivedAt: 'not-a-timestamp' }),
    ).rejects.toThrow('cutoff must be an ISO timestamp')
  })

  it('reports terminal manual epochs and legacy missing-epoch archives distinctly', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Expected audit classification author fixture')
    const suffix = randomUUID().replaceAll('-', '')
    const idPrefix = `ffffffff-ffff-7fff-bfff-${suffix.slice(0, 10)}`
    const legacyId = `${idPrefix}01`
    const predecessorId = `${idPrefix}02`
    const successorId = `${idPrefix}03`
    const topicId = await insertTestTopic({
      name: `Review audit classifications ${suffix}`,
      slug: `review-audit-classifications-${suffix}`,
      createdById: author.id,
    })
    for (const [id, label] of [
      [legacyId, 'legacy'],
      [predecessorId, 'predecessor'],
      [successorId, 'successor'],
    ] as const) {
      await insertTestPost({
        id,
        title: `Review audit ${label} ${suffix}`,
        slug: `review-audit-${label}-${suffix}`,
        markdown: 'Review succession audit classification fixture.',
        createdById: author.id,
        postType: 'review',
      })
      await insertTestPostReview(id, topicId)
    }
    await archivePost(legacyId, author.id)
    await reconcileReviewSuccessionsForPostIds([successorId])
    await archivePost(predecessorId, author.id)

    const restore = overrideDynamicConfigFieldsForTest(postsWorkConfig, {
      review_succession_history_audit_page_size: 1,
    })
    try {
      const { result } = await observeTestPostgresQueryPools(
        '/* listReviewSuccessionHistoryAuditRows */',
        () => auditReviewSuccessionHistory({ cursor: `${idPrefix}00`, cutoffArchivedAt: null }),
        () => {
          overrideDynamicConfigFieldsForTest(postsWorkConfig, {
            review_succession_history_audit_page_size: 500,
          })
        },
      )
      expect(result.findings).toHaveLength(1)
      expect(result.hasMore).toBe(true)
      expect(result.cursor).toBe(legacyId)
      const next = await auditReviewSuccessionHistory({
        cursor: result.cursor,
        cutoffArchivedAt: result.cutoffArchivedAt,
      })
      expect([...result.findings, ...next.findings]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ postId: legacyId, classification: 'ambiguous_missing_epoch' }),
          expect.objectContaining({ postId: predecessorId, classification: 'terminal_manual' }),
        ]),
      )
    } finally {
      restore()
    }
  })

  it('rejects malformed post IDs before reconciling succession evidence', async () => {
    await expect(reconcileReviewSuccessionsForPostIds(['not-a-uuid'])).rejects.toThrow(
      'must be UUIDs',
    )
  })
})
