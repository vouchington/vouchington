import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { listUserRemovedPosts } from './list-user-removed.mts'

describe('deleted community removals', () => {
  it('keeps the next community removal when a deleted post sits between reviews', async () => {
    const moderator = await createTestUser()
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id, visibility: 'public' })
    const postIds = []
    for (const [title, removedAt] of [
      ['newer', new Date('2026-05-03T00:00:00.000000Z')],
      ['deleted', new Date('2026-05-02T00:00:00.000000Z')],
      ['older', new Date('2026-05-01T00:00:00.000000Z')],
    ] as const) {
      const postId = await insertTestPost({
        title: `${title} ${crypto.randomUUID()}`,
        slug: `${title}-${crypto.randomUUID()}`,
        createdById: user.id,
        communityId: community.id,
        markdown: 'Removed',
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
      postIds.push(postId)
    }
    await deleteTestPost(postIds[1]!)

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await listUserRemovedPosts(user.id, { limit: 1, after })
      seen.push(...page.results.map(post => post.post_id))
      if (page.results.length === 0 && page.page_info.has_next_page) emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual([postIds[0]!, postIds[2]!])
    expect(emptyContinuation).toBe(true)
  })
})
