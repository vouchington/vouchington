import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
  insertTestReportJudgement,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('community moderation report privacy', () => {
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

  it('does not let community moderators infer hidden judgement from severity sorting', async () => {
    const severePostId = await createCommunityPost(community.id)
    const recentPostId = await createCommunityPost(community.id)
    const severeReportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: severePostId,
      createdAt: new Date(Date.UTC(2503, 0, 1)),
    })
    const recentReportId = await insertTestModerationReport({
      reporterUserId: (await createTestUser()).id,
      entityType: 'post',
      entityId: recentPostId,
      createdAt: new Date(Date.UTC(2503, 0, 2)),
    })
    await insertTestReportJudgement({
      entityType: 'post',
      entityId: severePostId,
      triggeringReportId: severeReportId,
      recommendedAction: 'remove',
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/reports/pending?sort=severity`)
      .expect(200)
    const ids = (response.body.reports as Array<{ id: string }>).map(report => report.id)
    expect(ids.indexOf(recentReportId)).toBeLessThan(ids.indexOf(severeReportId))
  })

  it('redacts reporter details from community moderator action responses', async () => {
    const postId = await createCommunityPost(community.id)
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      note: 'Reporter note hidden on action response.',
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}/reports/${reportId}`)
      .send({ status: 'reviewed' })
      .expect(200)

    expect(response.body.report).toEqual(
      expect.objectContaining({ id: reportId, status: 'reviewed' }),
    )
    expect(response.body.report.reporter_user_id).toBeUndefined()
    expect(response.body.report.note).toBeUndefined()
  })

  function createCommunityPost(communityId: string) {
    return insertTestPost({
      createdById: moderator.id,
      slug: `community-report-privacy-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Community report target',
      markdown: 'Body',
      communityId,
    })
  }
})
