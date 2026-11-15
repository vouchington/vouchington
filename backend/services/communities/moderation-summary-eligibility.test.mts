import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
} from '@voucha/test-helpers'
import { insertTestPost } from '@voucha/test-helpers/entities/posts'
import { markTestPostDeletedBy } from '@voucha/test-helpers/entities/posts-deletion'
import { insertTestPendingCommunityPostReview } from '@voucha/test-helpers/entities/community-post-reviews'
import { collectTestModerationSummaryState } from '@voucha/test-helpers/moderation-summary-collection'
import { recheckModerationSummaryCommunities } from './moderation-summary-eligibility.mts'

describe('moderator digest final authorization', () => {
  it('does not render a deleted selected discussion or a community after membership removal', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })
    await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
    const postId = await insertTestPost({
      createdById: user.id,
      communityId: community.id,
      title: 'Selected live discussion',
      markdown: 'Pending',
      slug: `digest-final-${crypto.randomUUID()}`,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: user.id,
    })
    const end = new Date()
    const { collection, communities } = await collectTestModerationSummaryState(
      user.id,
      new Date(end.getTime() - 86400000),
      end,
      end,
    )
    expect(communities).toEqual([
      expect.objectContaining({
        communityId: community.id,
        topDiscussionTitle: 'Selected live discussion',
      }),
    ])
    await markTestPostDeletedBy(postId, user.id)
    const live = await recheckModerationSummaryCommunities(
      user.id,
      communities,
      end,
      collection.top,
    )
    expect(live).toEqual([
      expect.objectContaining({
        communityId: community.id,
        topDiscussionTitle: null,
        topDiscussionReplyCount: 0,
      }),
    ])
    await removeTestCommunityMember(community.id, user.id)
    expect(
      await recheckModerationSummaryCommunities(user.id, communities, end, collection.top),
    ).toEqual([])
  })
})
