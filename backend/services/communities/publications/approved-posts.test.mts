import { describe, expect, it } from 'vitest'
import {
  archiveTestCommunity,
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { searchCommunityPosts } from './approved-posts.mts'

describe('searchCommunityPosts', () => {
  it('keeps approved posts readable after the community is archived', async () => {
    const author = await createTestUser()
    if (!author) throw new Error('Failed to create test author')
    const community = await insertTestCommunity({ createdById: author.id })
    const postId = await insertTestPost({
      communityId: community.id,
      createdById: author.id,
      markdown: 'archived community feed content',
      slug: `archived-community-feed-${createRandomString(8)}`,
      title: 'Archived community feed content',
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })
    await archiveTestCommunity({ communityId: community.id, archivedById: author.id })

    const result = await searchCommunityPosts(community.id)
    expect(result.results.map(post => post.id)).toEqual([postId])
  })
})
