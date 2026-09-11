import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
  insertTestModerationReport,
  insertTestReportJudgement,
  insertTestPost,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'
import { expectPendingReportsPagination } from './reports-pagination-test-support.mts'

describe('community moderation reports routes', () => {
  let moderator: PrivateUser
  let siteModerator: PrivateUser
  let reporter: PrivateUser
  let community: Community

  beforeAll(async () => {
    moderator = await createTestUser()
    siteModerator = await createTestUser({ extraRoles: ['moderator'] })
    reporter = await createTestUser()
    community = await insertTestCommunity({ createdById: moderator.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
  })

  it('lists pending post and comment reports for community moderators without reporter identity', async () => {
    const postId = await createCommunityPost(community.id)
    const commentId = await insertTestPost({
      createdById: moderator.id,
      slug: `community-report-comment-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Reported comment',
      markdown: 'Comment body',
      postType: 'comment',
      rootId: postId,
      parentId: postId,
      communityId: community.id,
    })
    const postReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      note: 'Reporter note for site staff only.',
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: postReportId,
    })
    const commentReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'comment',
      entityId: commentId,
      reason: 'harassment',
    })
    const secondReporter = await createTestUser()
    await insertTestModerationReport({
      reporterUserId: secondReporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'misinformation',
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/reports/pending`)
      .expect(200)

    expect(response.body.reports).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: postReportId, entity_type: 'post' }),
        expect.objectContaining({ id: commentReportId, entity_type: 'comment' }),
      ]),
    )
    const postReport = (response.body.reports as Array<Record<string, unknown>>).find(
      report => report.id === postReportId,
    )
    expect(postReport?.report_count).toBe(2)
    for (const report of response.body.reports as Array<Record<string, unknown>>) {
      expect(report.reporter_user_id).toBeUndefined()
      expect(report.reporter_username).toBeUndefined()
      expect(report.note).toBeUndefined()
      expect(report.judgement).toBeNull()
    }
  })

  it('marks reports for currently pending community reviews', async () => {
    const pendingPostId = await createCommunityPost(community.id)
    const approvedPostId = await createCommunityPost(community.id)
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: pendingPostId,
      submittedById: moderator.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: approvedPostId,
      submittedById: moderator.id,
    })
    const pendingReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: pendingPostId,
    })
    const approvedReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: approvedPostId,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/reports/pending`)
      .expect(200)

    const byId = new Map(
      (
        response.body.reports as Array<{ id: string; target_pending_community_review: boolean }>
      ).map(report => [report.id, report]),
    )
    expect(byId.get(pendingReportId)?.target_pending_community_review).toBe(true)
    expect(byId.get(approvedReportId)?.target_pending_community_review).toBe(false)
  })

  it('allows site moderators to list pending reports without community membership', async () => {
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      note: 'Reporter note visible to site staff.',
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: postId,
      triggeringReportId: reportId,
      internalResponse: 'Staff internal judgement.',
    })
    const request = createRequest()
    await request.authenticateAs(siteModerator)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/reports/pending`)
      .expect(200)

    expect(Array.isArray(response.body.reports)).toBe(true)
    const report = (response.body.reports as Array<Record<string, unknown>>).find(
      entry => entry.id === reportId,
    )
    expect(report?.note).toBe('Reporter note visible to site staff.')
    expect((report?.judgement as Record<string, unknown>)?.internal_response).toBe(
      'Staff internal judgement.',
    )
  })

  it('sorts pending reports by most reported', async () => {
    const heavilyReportedPostId = await createCommunityPost(community.id)
    const lightlyReportedPostId = await createCommunityPost(community.id)
    const reporters = await Promise.all([createTestUser(), createTestUser(), createTestUser()])
    const heavyReportIds = await Promise.all(
      reporters.slice(0, 2).map(user =>
        insertTestModerationReport({
          reporterUserId: user!.id,
          entityType: 'post',
          entityId: heavilyReportedPostId,
          createdAt: new Date(Date.UTC(2503, 0, 1)),
        }),
      ),
    )
    const lightReportId = await insertTestModerationReport({
      reporterUserId: reporters[2]!.id,
      entityType: 'post',
      entityId: lightlyReportedPostId,
      createdAt: new Date(Date.UTC(2503, 0, 1)),
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/reports/pending?sort=most_reported`)
      .expect(200)
    const ids = (response.body.reports as Array<{ id: string }>).map(report => report.id)

    expect(ids.indexOf(heavyReportIds[0]!)).toBeLessThan(ids.indexOf(lightReportId))
    expect(ids.indexOf(heavyReportIds[1]!)).toBeLessThan(ids.indexOf(lightReportId))
  })

  it('paginates pending reports with a sort-scoped opaque cursor', async () => {
    await expectPendingReportsPagination(moderator, community)
  })

  it('does not list reports from other communities', async () => {
    const otherOwner = await createTestUser()
    const otherCommunity = await insertTestCommunity({ createdById: otherOwner.id })
    const otherPostId = await createCommunityPost(otherCommunity.id, otherOwner.id)
    const otherReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: otherPostId,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/reports/pending`)
      .expect(200)

    expect(response.body.reports.map((report: { id: string }) => report.id)).not.toContain(
      otherReportId,
    )
  })

  it('allows community moderators to mark community-scoped reports reviewed', async () => {
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}/reports/${reportId}`)
      .send({ status: 'reviewed' })
      .expect(200)

    expect(response.body.report).toEqual(
      expect.objectContaining({
        id: reportId,
        status: 'reviewed',
        resolved_by_id: moderator.id,
      }),
    )
    expect(response.body.report.reporter_user_id).toBeUndefined()
    expect(response.body.report.note).toBeUndefined()
  })

  it('returns 403 when resolving a report outside the moderator community', async () => {
    const otherOwner = await createTestUser()
    const otherCommunity = await insertTestCommunity({ createdById: otherOwner.id })
    const otherPostId = await createCommunityPost(otherCommunity.id, otherOwner.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: otherPostId,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    await request
      .patch(`/api/v1/communities/${community.slug}/reports/${reportId}`)
      .send({ status: 'reviewed' })
      .expect(403)
  })

  function createCommunityPost(communityId: string, createdById = moderator.id) {
    return insertTestPost({
      createdById,
      slug: `community-report-post-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Community report target',
      markdown: 'Body',
      communityId,
    })
  }
})
