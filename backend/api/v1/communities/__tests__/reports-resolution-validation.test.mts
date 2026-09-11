import { beforeAll, describe, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('PATCH /api/v1/communities/:idOrSlug/reports/:reportId validation', () => {
  let moderator: PrivateUser
  let reporter: PrivateUser
  let community: Community

  beforeAll(async () => {
    moderator = await createTestUser()
    reporter = await createTestUser()
    community = await insertTestCommunity({ createdById: moderator.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
  })

  it('returns 422 for invalid community-scoped resolution status', async () => {
    const postId = await insertTestPost({
      createdById: moderator.id,
      slug: `community-report-validation-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Community report validation target',
      markdown: 'Body',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    await request
      .patch(`/api/v1/communities/${community.slug}/reports/${reportId}`)
      .send({ status: 'actioned' })
      .expect(422)
  })
})
