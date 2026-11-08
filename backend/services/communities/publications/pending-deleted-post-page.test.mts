import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  deleteTestPost,
  insertTestCommunity,
  insertTestPendingCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { searchPendingPosts } from './get.mts'

describe('pending community posts past deleted posts', () => {
  it('keeps the next pending post when a deleted post sits between reviews', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const postIds = []
    for (const title of ['before', 'deleted', 'after']) {
      const postId = await insertTestPost({
        title: `${title} ${crypto.randomUUID()}`,
        slug: `${title}-${crypto.randomUUID()}`,
        markdown: 'Pending',
        createdById: owner.id,
        communityId: community.id,
      })
      await insertTestPendingCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: owner.id,
      })
      postIds.push(postId)
    }
    await deleteTestPost(postIds[1]!)
    const expected = [postIds[0]!, postIds[2]!].toSorted()

    const seen: string[] = []
    let after: string | undefined
    let emptyContinuation = false
    for (let step = 0; step < 6; step++) {
      const page = await searchPendingPosts(community.id, { limit: 1, after })
      seen.push(...page.results.map(post => post.id))
      if (page.results.length === 0 && page.page_info.has_next_page) emptyContinuation = true
      if (!page.page_info.has_next_page) break
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual(expected)
    expect(emptyContinuation).toBe(false)
  })
})
