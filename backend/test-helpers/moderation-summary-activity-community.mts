import type { Community } from '@voucha/types/entities/community'
import type { PrivateUser } from '@voucha/types/entities/user'
import { insertTestCommunity } from './entities/communities.mts'
import { insertTestCommunityMember } from './entities/community-members.mts'
import { insertTestPendingCommunityPostReview } from './entities/community-post-reviews.mts'
import { insertTestPost } from './entities/posts.mts'
import { createTestUser } from './entities/users.mts'

const OUTSIDE_ACTIVITY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

export async function insertBackdatedModerationSummaryCommunity(pendingPost: {
  title: string
  slugPrefix: string
  markdown: string
}): Promise<{
  owner: PrivateUser
  community: Community
  outsideWindow: Date
  pendingPostId: string
}> {
  const owner = await createTestUser()
  const outsideWindow = new Date(Date.now() - OUTSIDE_ACTIVITY_WINDOW_MS)
  const community = await insertTestCommunity({ createdById: owner.id })
  await insertTestCommunityMember({
    communityId: community.id,
    userId: owner.id,
    role: 'owner',
    approvedById: owner.id,
    createdAt: outsideWindow,
  })
  const pendingPostId = await insertTestPost({
    title: pendingPost.title,
    slug: `${pendingPost.slugPrefix}-${owner.id}`,
    createdById: owner.id,
    markdown: pendingPost.markdown,
    communityId: community.id,
    postType: 'discussion',
    createdAt: outsideWindow,
  })
  await insertTestPendingCommunityPostReview({
    communityId: community.id,
    postId: pendingPostId,
    submittedById: owner.id,
  })
  return { owner, community, outsideWindow, pendingPostId }
}
