import { describe } from 'vitest'
import { insertTestModerationReport, insertTestPost } from '@voucha/test-helpers'
import { registerCommunityModInternalThreadRouteTests } from '../../../../test-helpers/community-mod-internal-thread-route-tests.mts'

describe('community moderation report mod-internal-thread routes', () => {
  registerCommunityModInternalThreadRouteTests({
    conversationSubjectField: 'moderation_report_id',
    createSubject: async ({ community, subjectUser }) => {
      const postId = await insertTestPost({
        createdById: subjectUser.id,
        slug: `report-mit-post-${crypto.randomUUID().slice(0, 8)}`,
        title: 'Post for mod-internal-thread',
        markdown: 'Body',
        communityId: community.id,
      })
      return insertTestModerationReport({
        reporterUserId: subjectUser.id,
        entityType: 'post',
        entityId: postId,
      })
    },
    resource: 'reports',
    subjectUserIsMember: false,
  })
})
