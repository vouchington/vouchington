import { describe } from 'vitest'
import { insertTestPendingCommunityPostReview, insertTestPost } from '@voucha/test-helpers'
import { registerCommunityModInternalThreadRouteTests } from '../../../../test-helpers/community-mod-internal-thread-route-tests.mts'

describe('community moderation post mod-internal-thread routes', () => {
  registerCommunityModInternalThreadRouteTests({
    conversationSubjectField: 'post_id',
    createSubject: async ({ community, subjectUser }) => {
      const postId = await insertTestPost({
        createdById: subjectUser.id,
        slug: `post-mit-post-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for post mod-internal-thread',
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
    resource: 'posts',
    subjectUserIsMember: true,
  })
})
