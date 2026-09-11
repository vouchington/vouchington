import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestModerationReport,
  insertTestPost,
  insertTestSystemModerationReport,
  setTestBanEvasionFlag,
} from '@voucha/test-helpers'
import type { Community } from '@services/communities/types'
import type { PrivateUser } from '@services/users/types'

describe('community moderation report redaction', () => {
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

  it('limits community ban evasion context for community moderators but not site staff', async () => {
    const suspect = await createTestUser()
    await insertTestCommunityMember({
      communityId: community.id,
      userId: suspect.id,
    })
    await setTestBanEvasionFlag({
      communityId: community.id,
      userId: suspect.id,
      sourceUserId: moderator.id,
      score: 0.91,
    })
    const reportId = await insertTestSystemModerationReport(
      'user',
      suspect.id,
      'Suspected ban evasion',
    )

    const moderatorRequest = createRequest()
    await moderatorRequest.authenticateAs(moderator)
    const moderatorResponse = await moderatorRequest
      .get(`/api/v1/communities/${community.slug}/reports/pending`)
      .expect(200)
    const moderatorReport = (moderatorResponse.body.reports as Array<Record<string, unknown>>).find(
      entry => entry.id === reportId,
    )
    expect(moderatorReport?.community_ban_evasion).toEqual({
      community_id: community.id,
      community_slug: community.slug,
    })

    const staffRequest = createRequest()
    await staffRequest.authenticateAs(siteModerator)
    const staffResponse = await staffRequest
      .get(`/api/v1/communities/${community.slug}/reports/pending`)
      .expect(200)
    const staffReport = (staffResponse.body.reports as Array<Record<string, unknown>>).find(
      entry => entry.id === reportId,
    )
    expect(staffReport?.community_ban_evasion).toEqual(
      expect.objectContaining({
        community_id: community.id,
        score: 0.91,
      }),
    )
  })

  it('redacts anonymous target metadata for community moderators', async () => {
    const postId = await insertTestPost({
      createdById: moderator.id,
      slug: `community-report-anonymous-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Anonymous community report target',
      markdown: 'Body',
      communityId: community.id,
      isAnonymous: true,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
    })
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request
      .get(`/api/v1/communities/${community.slug}/reports/pending`)
      .expect(200)
    const report = (response.body.reports as Array<Record<string, unknown>>).find(
      entry => entry.id === reportId,
    )

    expect(report?.target_user_id).toBeNull()
    expect(report?.target_is_anonymous).toBeUndefined()
  })
})
