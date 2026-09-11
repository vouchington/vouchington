import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestPost,
  insertTestCommunityPostReview,
  setTestPostRejectedAt,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor } from '@modules/pagination'
import { listUserRemovedPosts } from './list-user-removed.mts'

describe('listUserRemovedPosts', () => {
  let moderator: PrivateUser
  let author: PrivateUser

  beforeAll(async () => {
    moderator = await createTestUser()
    author = await createTestUser()
  })

  it('returns empty results for a user with no removed posts', async () => {
    const user = await createTestUser()
    const { results, page_info } = await listUserRemovedPosts(user.id)
    expect(results.length).toBe(0)
    expect(page_info.has_next_page).toBe(false)
    expect(page_info.end_cursor).toBeNull()
    expect(page_info.start_cursor).toBeNull()
  })

  it('returns community-removed posts for a user', async () => {
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })
    const postId = await insertTestPost({
      title: `Removed Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `removed-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: author.id,
      markdown: 'Some content',
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })

    const { results } = await listUserRemovedPosts(author.id)
    const found = results.find(r => r.post_id === postId)
    expect(found).toBeDefined()
    expect(found?.community_id).toBe(community.id)
    expect(found?.community_slug).toBe(community.slug)
    expect(found?.post_removal_kind).toBe('community')
    expect(typeof found?.unpublished_at).toBe('string')
  })

  it('does not expose another author post submitted by the current user', async () => {
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })
    const submitter = await createTestUser()
    const postId = await insertTestPost({
      title: `Other Author Removed Post ${crypto.randomUUID()}`,
      slug: `other-author-removed-post-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Owned by another user',
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: submitter.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })

    const legacy = await listUserRemovedPosts(submitter.id)
    expect(legacy.results.some(post => post.post_id === postId)).toBe(false)
  })

  it('keeps the legacy community-only contract unless platform removals are requested', async () => {
    const user = await createTestUser()
    const postId = await insertTestPost({
      title: `Platform Removed ${crypto.randomUUID()}`,
      slug: `platform-removed-${crypto.randomUUID()}`,
      createdById: user.id,
      markdown: 'Removed by platform review',
      clearanceStatus: 'rejected',
    })

    const legacy = await listUserRemovedPosts(user.id)
    const expanded = await listUserRemovedPosts(user.id, { includePlatform: true })

    expect(legacy.results.some(post => post.post_id === postId)).toBe(false)
    expect(expanded.results).toContainEqual(
      expect.objectContaining({
        post_id: postId,
        community_id: null,
        community_slug: null,
        post_removal_kind: 'platform',
      }),
    )
  })

  it('retains both removal kinds for one post across a one-item page boundary', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })
    const removedAt = new Date('2026-07-29T12:34:56.123456Z')
    const postId = await insertTestPost({
      title: `Dual Removal ${crypto.randomUUID()}`,
      slug: `dual-removal-${crypto.randomUUID()}`,
      createdById: user.id,
      communityId: community.id,
      markdown: 'Removed twice',
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user.id,
    })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: removedAt,
    })
    await setTestPostRejectedAt(postId, removedAt)

    const firstPage = await listUserRemovedPosts(user.id, {
      includePlatform: true,
      limit: 1,
    })
    const secondPage = await listUserRemovedPosts(user.id, {
      includePlatform: true,
      limit: 1,
      after: firstPage.page_info.end_cursor!,
    })

    expect(firstPage.results[0]?.post_id).toBe(postId)
    expect(secondPage.results[0]?.post_id).toBe(postId)
    expect(
      new Set([firstPage.results[0]?.post_removal_kind, secondPage.results[0]?.post_removal_kind]),
    ).toEqual(new Set(['platform', 'community']))
  })

  it('does not return posts that are not unpublished', async () => {
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })
    const postId = await insertTestPost({
      title: `Approved Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `approved-post-${crypto.randomUUID().slice(0, 8)}`,
      createdById: author.id,
      markdown: 'Active content',
      clearanceStatus: 'approved',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })
    // No unpublishedAt set — post is still published

    const { results } = await listUserRemovedPosts(author.id)
    const found = results.find(r => r.post_id === postId)
    expect(found).toBeUndefined()
  })

  it('paginates with after', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })

    const postIds = await Promise.all(
      Array.from({ length: 3 }, async (_, i) => {
        const postId = await insertTestPost({
          title: `Paginated Post ${i} ${crypto.randomUUID().slice(0, 8)}`,
          slug: `paginated-post-${i}-${crypto.randomUUID().slice(0, 8)}`,
          createdById: user.id,
          markdown: 'Content',
          clearanceStatus: 'approved',
        })
        await insertTestCommunityPostReview({
          communityId: community.id,
          postId,
          submittedById: user.id,
        })
        await updateTestCommunityPostReviewState({
          communityId: community.id,
          postId,
          unpublishedAt: new Date(Date.now() - i * 1000),
        })
        return postId
      }),
    )

    const firstPage = await listUserRemovedPosts(user.id, { limit: 2 })
    expect(firstPage.results.length).toBe(2)
    expect(firstPage.page_info.has_next_page).toBe(true)
    expect(firstPage.page_info.end_cursor).not.toBeNull()
    expect(firstPage.page_info.start_cursor).not.toBeNull()

    const otherUser = await createTestUser()
    await expect(
      listUserRemovedPosts(otherUser.id, {
        limit: 2,
        after: firstPage.page_info.end_cursor!,
      }),
    ).rejects.toMatchObject({ status: 400 })

    const secondPage = await listUserRemovedPosts(user.id, {
      limit: 2,
      after: firstPage.page_info.end_cursor!,
    })
    expect(secondPage.results.length).toBeGreaterThanOrEqual(1)

    const firstIds = new Set(firstPage.results.map(r => r.post_id))
    for (const post of secondPage.results) {
      expect(firstIds.has(post.post_id)).toBe(false)
    }

    // Cleanup reference (postIds used to ensure they're created)
    expect(postIds.length).toBe(3)
  })

  it('throws 422 for non-integer limit', async () => {
    await expect(listUserRemovedPosts(author.id, { limit: 2.5 })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 422 for limit out of range (0)', async () => {
    await expect(listUserRemovedPosts(author.id, { limit: 0 })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 422 for limit out of range (101)', async () => {
    await expect(listUserRemovedPosts(author.id, { limit: 101 })).rejects.toMatchObject({
      status: 422,
    })
  })

  it('throws 400 for invalid cursor format', async () => {
    const badCursor = encodeCursor({ id: 'not-a-uuid' })
    await expect(listUserRemovedPosts(author.id, { after: badCursor })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('throws 400 for a cursor with malformed timestamp', async () => {
    const badCursor = encodeCursor({ name: 'not-a-date', id: crypto.randomUUID() })
    await expect(listUserRemovedPosts(author.id, { after: badCursor })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('rejects an otherwise-valid unscoped cursor', async () => {
    const unscopedCursor = encodeCursor({
      timestamp: '2024-01-01T00:00:00.000000Z',
      id: crypto.randomUUID(),
    })
    await expect(listUserRemovedPosts(author.id, { after: unscopedCursor })).rejects.toMatchObject({
      status: 400,
    })
  })

  it('throws 400 for a completely malformed cursor string', async () => {
    await expect(
      listUserRemovedPosts(author.id, { after: 'not-valid-cursor!!!' }),
    ).rejects.toMatchObject({ status: 400 })
  })
})
