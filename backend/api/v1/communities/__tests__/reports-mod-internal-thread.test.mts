import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('community moderation report mod-internal-thread routes', () => {
  let moderator: PrivateUser
  let member: PrivateUser
  let reporter: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[moderator, member, reporter] = (await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])) as PrivateUser[]
    community = await insertTestCommunity({ createdById: moderator.id })
    await Promise.all([
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'moderator',
      }),
      insertTestCommunityMember({ communityId: community.id, userId: member.id, role: 'member' }),
    ])
  })

  async function createReportForCommunity(): Promise<string> {
    const postId = await insertTestPost({
      createdById: reporter.id,
      slug: `report-mit-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for mod-internal-thread',
      markdown: 'Body',
      communityId: community.id,
    })
    return insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
  }

  describe('POST /api/v1/communities/:idOrSlug/reports/:reportId/mod-internal-thread', () => {
    it('returns 401 when not authenticated', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/mod-internal-thread`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/mod-internal-thread`)
        .expect(403)
    })

    it('allows a community moderator to open a mod internal thread and returns the conversation', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(moderator)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/mod-internal-thread`)
        .expect(200)
      expect(response.body.conversation).toMatchObject({
        channel_type: 'mod_internal',
        community_id: community.id,
        moderation_report_id: reportId,
      })
    })

    it('is idempotent — returns the same conversation on repeated calls', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(moderator)
      const first = await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/mod-internal-thread`)
        .expect(200)
      const second = await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/mod-internal-thread`)
        .expect(200)
      expect(second.body.conversation.id).toBe(first.body.conversation.id)
    })

    it('allows a site staff user to open a mod internal thread', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(staff)
      const response = await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/mod-internal-thread`)
        .expect(200)
      expect(response.body.conversation).toHaveProperty('id')
    })
  })
})
