import { beforeAll, describe, it } from 'vitest'
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

describe('community moderation report escalation routes', () => {
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
      slug: `report-esc-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for report escalation',
      markdown: 'Body',
      communityId: community.id,
    })
    return insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
  }

  describe('POST /api/v1/communities/:idOrSlug/reports/:reportId/escalation', () => {
    it('returns 401 when not authenticated', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(403)
    })

    it('allows a community moderator to escalate a report and returns 204', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(moderator)
      await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(204)
    })

    it('allows a site staff user to escalate a report', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(staff)
      await request
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(204)
    })
  })

  describe('DELETE /api/v1/communities/:idOrSlug/reports/:reportId/escalation', () => {
    it('returns 401 when not authenticated', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .delete(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(403)
    })

    it('allows a community moderator to de-escalate a report and returns 204', async () => {
      const reportId = await createReportForCommunity()
      // First escalate
      const escRequest = createRequest()
      await escRequest.authenticateAs(moderator)
      await escRequest
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(204)
      // Then de-escalate
      const deEscRequest = createRequest()
      await deEscRequest.authenticateAs(moderator)
      await deEscRequest
        .delete(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(204)
    })

    it('rejects de-escalation through a different community URL', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const otherCommunity = await insertTestCommunity({ createdById: staff.id })
      const reportId = await createReportForCommunity()

      const escRequest = createRequest()
      await escRequest.authenticateAs(staff)
      await escRequest
        .post(`/api/v1/communities/${community.slug}/reports/${reportId}/escalation`)
        .expect(204)

      const deEscRequest = createRequest()
      await deEscRequest.authenticateAs(staff)
      await deEscRequest
        .delete(`/api/v1/communities/${otherCommunity.slug}/reports/${reportId}/escalation`)
        .expect(403)
    })
  })
})
