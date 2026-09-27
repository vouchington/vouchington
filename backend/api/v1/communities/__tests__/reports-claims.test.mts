import { describe } from 'vitest'
import { insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { registerCommunityModerationRouteTests } from '../../../../test-helpers/community-moderation-route-tests.mts'

describe('community moderation report claim routes', () => {
  registerCommunityModerationRouteTests({
    action: 'claim',
    resource: 'reports',
    subjectUserIsMember: false,
    crossCommunity: 'staff-403',
    claimIdField: 'report_id',
    createSubject: async ({ community, subjectUser }) => {
      const postId = await insertTestPost({
        createdById: subjectUser.id,
        slug: `report-claim-post-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for report claim',
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
