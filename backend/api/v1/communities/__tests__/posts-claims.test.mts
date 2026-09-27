import { describe } from 'vitest'
import { insertTestPendingCommunityPostReview, insertTestPost } from '@voucha/test-helpers'
import { registerCommunityModerationRouteTests } from '../../../../test-helpers/community-moderation-route-tests.mts'

describe('community moderation post claim routes', () => {
  registerCommunityModerationRouteTests({
    action: 'claim',
    resource: 'posts',
    subjectUserIsMember: true,
    crossCommunity: 'moderator-404',
    claimIdField: 'post_id',
    createSubject: async ({ community, subjectUser }) => {
      const postId = await insertTestPost({
        createdById: subjectUser.id,
        slug: `post-claim-post-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for post claim',
        markdown: 'Body',
        communityId: community.id,
      })
      await insertTestPendingCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: subjectUser.id,
      })
      return postId
    },
  })
})
