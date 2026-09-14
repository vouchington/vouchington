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

describe('community moderation report claim routes', () => {
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
      slug: `report-claim-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for report claim',
      markdown: 'Body',
      communityId: community.id,
    })
    return insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
  }

  describe('PUT /api/v1/communities/:idOrSlug/reports/:reportId/claim', () => {
    it('returns 401 when not authenticated', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request
        .put(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .put(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(403)
    })

    it('allows a community moderator to claim a report and returns claim data', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(moderator)
      const response = await request
        .put(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(200)
      expect(response.body.claim).toMatchObject({
        report_id: reportId,
        claimed_by_id: moderator.id,
      })
      expect(response.body.claimed_by_other).toBe(false)
    })

    it('allows a site staff user to claim a report', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(staff)
      const response = await request
        .put(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(200)
      expect(response.body.claim).toMatchObject({ report_id: reportId })
    })
  })

  describe('DELETE /api/v1/communities/:idOrSlug/reports/:reportId/claim', () => {
    it('returns 401 when not authenticated', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request
        .delete(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(401)
    })

    it('returns 403 for a non-moderator member', async () => {
      const reportId = await createReportForCommunity()
      const request = createRequest()
      await request.authenticateAs(member)
      await request
        .delete(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(403)
    })

    it('allows a community moderator to release a claim and returns 204', async () => {
      const reportId = await createReportForCommunity()
      // First claim it
      const claimRequest = createRequest()
      await claimRequest.authenticateAs(moderator)
      await claimRequest
        .put(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(200)
      // Then release it
      const releaseRequest = createRequest()
      await releaseRequest.authenticateAs(moderator)
      await releaseRequest
        .delete(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(204)
    })

    it('rejects release attempts through a different community URL', async () => {
      const staff = await createTestUser({ extraRoles: ['moderator'] })
      const otherCommunity = await insertTestCommunity({ createdById: staff.id })
      const reportId = await createReportForCommunity()

      const claimRequest = createRequest()
      await claimRequest.authenticateAs(staff)
      await claimRequest
        .put(`/api/v1/communities/${community.slug}/reports/${reportId}/claim`)
        .expect(200)

      const releaseRequest = createRequest()
      await releaseRequest.authenticateAs(staff)
      await releaseRequest
        .delete(`/api/v1/communities/${otherCommunity.slug}/reports/${reportId}/claim`)
        .expect(403)
    })
  })
})
