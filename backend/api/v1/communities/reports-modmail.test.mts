import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  blockUser,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
  softDeleteUser,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('POST /api/v1/communities/:idOrSlug/reports/:reportId/modmail', () => {
  let moderator: PrivateUser
  let siteAdmin: PrivateUser
  let siteModerator: PrivateUser
  let reporter: PrivateUser
  let community: Community

  beforeAll(async () => {
    moderator = await createTestUser()
    siteAdmin = await createTestUser({ administrator: true })
    siteModerator = await createTestUser({ extraRoles: ['moderator'] })
    reporter = await createTestUser()
    community = await insertTestCommunity({ createdById: moderator.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
  })

  function createCommunityPost(communityId: string, createdById = moderator.id) {
    return insertTestPost({
      createdById,
      slug: `report-modmail-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Community report target',
      markdown: 'Body',
      communityId,
    })
  }

  it('opens a private DM with the reporter (site staff only)', async () => {
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    const response = await request
      .post(`/api/v1/communities/${community.slug}/reports/${reportId}/modmail`)
      .send({})
      .expect(201)

    expect(response.body.conversation).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        channel_type: 'direct_message',
      }),
    )
  })

  it('allows site moderators (not community mods) to open reporter DM', async () => {
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(siteModerator)

    const response = await request
      .post(`/api/v1/communities/${community.slug}/reports/${reportId}/modmail`)
      .send({})
      .expect(201)

    expect(response.body.conversation).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        channel_type: 'direct_message',
      }),
    )
  })

  it('returns 403 when a community-only moderator tries to open reporter DM', async () => {
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    await request
      .post(`/api/v1/communities/${community.slug}/reports/${reportId}/modmail`)
      .send({})
      .expect(403)
  })

  it('returns 422 when the reporter has deleted their account', async () => {
    const deletedReporter = await createTestUser()
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: deletedReporter.id,
      entityType: 'post',
      entityId: postId,
    })
    await softDeleteUser(deletedReporter.id)
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request
      .post(`/api/v1/communities/${community.slug}/reports/${reportId}/modmail`)
      .send({})
      .expect(422)
  })

  it('returns 422 when a block exists between staff and reporter', async () => {
    const blockedReporter = await createTestUser()
    await blockUser(blockedReporter, siteAdmin)
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: blockedReporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request
      .post(`/api/v1/communities/${community.slug}/reports/${reportId}/modmail`)
      .send({})
      .expect(422)
  })

  it('returns 400 when the staff member is the reporter (self-contact)', async () => {
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: siteAdmin.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request
      .post(`/api/v1/communities/${community.slug}/reports/${reportId}/modmail`)
      .send({})
      .expect(400)
  })

  it('returns 404 when the report does not belong to the community', async () => {
    const otherOwner = await createTestUser()
    const otherCommunity = await insertTestCommunity({ createdById: otherOwner.id })
    const otherPostId = await createCommunityPost(otherCommunity.id, otherOwner.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: otherPostId,
    })
    const request = createRequest()
    await request.authenticateAs(siteAdmin)

    await request
      .post(`/api/v1/communities/${community.slug}/reports/${reportId}/modmail`)
      .send({})
      .expect(404)
  })
})
