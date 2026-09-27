import { describe } from 'vitest'
import { insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { registerCommunityModerationRouteTests } from '../../../../test-helpers/community-moderation-route-tests.mts'

describe('community moderation report escalation routes', () => {
  registerCommunityModerationRouteTests({
    action: 'escalation',
    resource: 'reports',
    subjectUserIsMember: false,
    crossCommunity: 'staff-403',
    createSubject: async ({ community, subjectUser }) => {
      const postId = await insertTestPost({
        createdById: subjectUser.id,
        slug: `report-esc-post-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for report escalation',
        markdown: 'Body',
        communityId: community.id,
      })
      return insertTestModerationReport({
        reporterUserId: subjectUser.id,
        entityType: 'post',
        entityId: postId,
      })
    },
  })
})
