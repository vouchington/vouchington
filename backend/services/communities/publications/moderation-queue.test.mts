import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestCommunity,
  insertTestPendingCommunityPostReview,
  deleteTestPost,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import {
  searchCommunityModerationQueue,
  encodeCommunityModerationQueueCursor,
} from './moderation-queue.mts'
import crypto from 'node:crypto'

describe('searchCommunityModerationQueue', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('returns reports for a community', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-comm-${crypto.randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Queue Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
    })

    expect(result.entries.length).toBeGreaterThanOrEqual(1)
    const entry = result.entries.find(e => e.entity_id === postId)
    expect(entry).toBeDefined()
    expect(entry!.queue_source).toBe('report')
    expect(entry!.target_content).toEqual({
      kind: 'post',
      text: expect.stringContaining('Mod Queue Post'),
      declared_language: null,
      lingua_rs_detected_language: null,
    })
  })

  it('returns community_review entries when includePendingReviews is true', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Reviews Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-reviews-comm-${crypto.randomUUID().slice(0, 8)}`,
      post_approval_required_at: new Date(),
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-review-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Queue Review Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
    })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      includePendingReviews: true,
    })

    const reviewEntry = result.entries.find(
      e => e.entity_id === postId && e.queue_source === 'community_review',
    )
    expect(reviewEntry).toBeDefined()
    expect(reviewEntry!.target_content).toEqual({
      kind: 'post',
      text: expect.stringContaining('Mod Queue Review Post'),
      declared_language: null,
      lingua_rs_detected_language: null,
    })
  })

  it('does NOT return community_review entries when includePendingReviews is false', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue No Reviews Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-no-reviews-comm-${crypto.randomUUID().slice(0, 8)}`,
      post_approval_required_at: new Date(),
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-no-review-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Queue No Review Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
    })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      includePendingReviews: false,
    })

    const reviewEntry = result.entries.find(
      e => e.entity_id === postId && e.queue_source === 'community_review',
    )
    expect(reviewEntry).toBeUndefined()
  })

  it('returns empty entries for a community with no activity', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Empty Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-empty-comm-${crypto.randomUUID().slice(0, 8)}`,
    })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
    })

    expect(result.entries).toEqual([])
    expect(result.hasNextPage).toBe(false)
  })

  it('respects limit and sets hasNextPage', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Limit Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-limit-comm-${crypto.randomUUID().slice(0, 8)}`,
    })

    // Create 3 posts with reports
    for (let i = 0; i < 3; i++) {
      const pid = await insertTestPost({
        createdById: author.id,
        slug: `mod-queue-limit-post-${i}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Mod Queue Limit Post ${i} ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
        communityId: community.id,
      })
      const r = await createTestUser()
      await insertTestModerationReport({
        reporterUserId: r.id,
        entityType: 'post',
        entityId: pid,
        reason: 'spam',
      })
    }

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 2,
    })

    expect(result.entries.length).toBe(2)
    expect(result.hasNextPage).toBe(true)
  })

  it('supports cursor pagination', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Cursor Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-cursor-comm-${crypto.randomUUID().slice(0, 8)}`,
    })

    const postIds: string[] = []
    for (let i = 0; i < 3; i++) {
      const pid = await insertTestPost({
        createdById: author.id,
        slug: `mod-queue-cursor-post-${i}-${crypto.randomUUID().slice(0, 8)}`,
        title: `Mod Queue Cursor Post ${i} ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
        communityId: community.id,
      })
      const r = await createTestUser()
      await insertTestModerationReport({
        reporterUserId: r.id,
        entityType: 'post',
        entityId: pid,
        reason: 'spam',
      })
      postIds.push(pid)
    }

    const page1 = await searchCommunityModerationQueue(community.id, { limit: 2 })
    expect(page1.entries.length).toBe(2)
    expect(page1.hasNextPage).toBe(true)

    const cursor = encodeCommunityModerationQueueCursor(page1.entries[page1.entries.length - 1]!)
    const page2 = await searchCommunityModerationQueue(community.id, {
      limit: 10,
      after: cursor,
    })

    // Ensure no overlap between pages
    const page1Ids = new Set(page1.entries.map(e => e.id))
    const page2Ids = page2.entries.map(e => e.id)
    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false)
    }
  })

  it('ignores malformed cursor and returns from beginning', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Bad Cursor Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-bad-cursor-comm-${crypto.randomUUID().slice(0, 8)}`,
    })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      after: 'not-valid-base64url-json',
    })

    expect(Array.isArray(result.entries)).toBe(true)
  })

  it('renders a soft-deleted report target as [deleted content] with no path', async () => {
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `Mod Queue Deleted ${crypto.randomUUID().slice(0, 8)}`,
      slug: `mod-queue-deleted-${crypto.randomUUID().slice(0, 8)}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-queue-deleted-post-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Queue Deleted Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
    })
    await deleteTestPost(postId)

    const result = await searchCommunityModerationQueue(community.id, { limit: 50 })
    const entry = result.entries.find(e => e.id === reportId)
    expect(entry).toBeDefined()
    expect(entry!.target_available).toBe(false)
    expect(entry!.target_label).toBe('[deleted content]')
    expect(entry!.target_path).toBeNull()
  })
})

describe('encodeCommunityModerationQueueCursor', () => {
  it('encodes and produces a valid base64url string', () => {
    const cursor = encodeCommunityModerationQueueCursor({
      cursor_created_at: '2026-01-01T00:00:00.000000Z',
      id: crypto.randomUUID(),
    })
    expect(typeof cursor).toBe('string')
    // Must be decodeable as JSON with created_at and id fields
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown
    expect(typeof decoded).toBe('object')
    expect(decoded).not.toBeNull()
    expect((decoded as Record<string, unknown>).created_at).toBe('2026-01-01T00:00:00.000000Z')
    expect(typeof (decoded as Record<string, unknown>).id).toBe('string')
  })
})
