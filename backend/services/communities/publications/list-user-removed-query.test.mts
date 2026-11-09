import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  setTestPostRejectedAt,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { listUserRemovedPosts } from './list-user-removed.mts'

describe('combined removal event pagination', () => {
  it('fills pages with both eligible removal events past deleted posts', async () => {
    const author = await createTestUser()
    const community = await insertTestCommunity({ createdById: author.id })
    const postIds: string[] = []
    for (const day of [3, 2, 1]) {
      const postId = await insertTestPost({
        createdById: author.id,
        communityId: community.id,
        title: `Removal events ${crypto.randomUUID()}`,
        slug: `removal-events-${crypto.randomUUID()}`,
        markdown: 'Removed twice',
        clearanceStatus: 'approved',
      })
      const removedAt = new Date(`2026-06-0${day}T00:00:00.000Z`)
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: author.id,
      })
      await updateTestCommunityPostReviewState({
        communityId: community.id,
        postId,
        unpublishedAt: removedAt,
      })
      await setTestPostRejectedAt(postId, removedAt)
      postIds.push(postId)
    }
    await deleteTestPost(postIds[1]!)
    const first = await listUserRemovedPosts(author.id, { includePlatform: true, limit: 2 })
    expect(first.results.map(row => [row.post_id, row.post_removal_kind])).toEqual([
      [postIds[0], 'platform'],
      [postIds[0], 'community'],
    ])
    expect(first.results.map(row => [row.community_id, row.community_slug])).toEqual([
      [community.id, community.slug],
      [community.id, community.slug],
    ])
    expect(first.page_info.has_next_page).toBe(true)
    const next = await listUserRemovedPosts(author.id, {
      includePlatform: true,
      limit: 2,
      after: first.page_info.end_cursor!,
    })
    expect(next.results.map(row => [row.post_id, row.post_removal_kind])).toEqual([
      [postIds[2], 'platform'],
      [postIds[2], 'community'],
    ])
    expect(next.results.map(row => [row.community_id, row.community_slug])).toEqual([
      [community.id, community.slug],
      [community.id, community.slug],
    ])
    expect(next.page_info.has_next_page).toBe(false)
  })
})
