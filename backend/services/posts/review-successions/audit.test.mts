import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import {
  createTestUser,
  insertTestPost,
  insertTestPostReview,
  insertTestTopic,
} from '@voucha/test-helpers'
import { describe, expect, it } from 'vitest'
import { archivePost } from '../archive.mts'
import {
  REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE,
  auditReviewSuccessionHistory,
  pageReviewSuccessionHistoryAuditRows,
} from './audit.mts'
import type { ReviewSuccessionHistoryAuditRow } from './audit-query.mts'
import { reconcileReviewSuccessionsForPostIds } from './reconcile.mts'
import { normalizeReviewSuccessionPostIds } from './list.mts'

const source = [
  readFileSync(new URL('./audit.mts', import.meta.url), 'utf8'),
  readFileSync(new URL('./audit-query.mts', import.meta.url), 'utf8'),
].join('\n')

describe('review succession history audit', () => {
  it('fixes a database cutoff on the first page and reuses it for continuations', async () => {
    const first = await auditReviewSuccessionHistory({ cursor: null, cutoffArchivedAt: null })
    const second = await auditReviewSuccessionHistory({
      cursor: first.cursor,
      cutoffArchivedAt: first.cutoffArchivedAt,
    })

    expect(first.cutoffArchivedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(second.cutoffArchivedAt).toBe(first.cutoffArchivedAt)
    expect(REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE).toBe(100)
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

  it('defines all historical classifications without writes', () => {
    expect(source).toContain("| 'active_automatic'")
    expect(source).toContain("| 'terminal_manual'")
    expect(source).toContain("| 'ambiguous_missing_epoch'")
    expect(source).toContain("| 'incoherent'")
    expect(source).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\b/)
  })

  it('only continues when a lookahead row proves another page exists', () => {
    const rows = Array.from({ length: REVIEW_SUCCESSION_HISTORY_AUDIT_PAGE_SIZE }, (_, index) =>
      auditRow(index),
    )

    expect(pageReviewSuccessionHistoryAuditRows(rows)).toMatchObject({
      cursor: rows.at(-1)?.id,
      hasMore: false,
    })
    expect(pageReviewSuccessionHistoryAuditRows([...rows, auditRow(rows.length)])).toMatchObject({
      rows,
      cursor: rows.at(-1)?.id,
      hasMore: true,
    })
  })

  it('includes current eligibility and archive facts for newer exact-current-set reviews', () => {
    expect(source).toContain('newerExactCurrentSetReviews')
    expect(source).toContain('buildPublicPostEligibilityFilter')
    expect(source).toContain('buildOtherwisePublicPostEligibilityFilter')
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

    const result = await auditReviewSuccessionHistory({
      cursor: `${idPrefix}00`,
      cutoffArchivedAt: null,
    })

    expect(result.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ postId: legacyId, classification: 'ambiguous_missing_epoch' }),
        expect.objectContaining({ postId: predecessorId, classification: 'terminal_manual' }),
      ]),
    )
  })

  it('rejects malformed post IDs before listing succession evidence', () => {
    expect(() => normalizeReviewSuccessionPostIds(['not-a-uuid'])).toThrow('must be UUIDs')
  })
})

function auditRow(index: number): ReviewSuccessionHistoryAuditRow {
  return {
    id: `00000000-0000-7000-8000-${index.toString().padStart(12, '0')}`,
    archived_at: new Date('2026-09-09T00:00:00.000Z'),
    author_user_id: null,
    topic_ids: null,
    matching_manual_override_at: null,
    matching_automatically_restored_at: null,
    active_predecessor_archived_at: null,
    newer_exact_current_set_reviews: [],
  }
}
