import { describe } from 'vitest'
import { insertTestPendingCommunityPostReview, insertTestPost } from '@voucha/test-helpers'
import { registerCommunityModerationRouteTests } from '../../../../test-helpers/community-moderation-route-tests.mts'

describe('community moderation post escalation routes', () => {
  registerCommunityModerationRouteTests({
    action: 'escalation',
    resource: 'posts',
    subjectUserIsMember: true,
    crossCommunity: 'moderator-404',
    createSubject: async ({ community, subjectUser }) => {
      const postId = await insertTestPost({
        createdById: subjectUser.id,
        slug: `post-esc-post-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for post escalation',
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
