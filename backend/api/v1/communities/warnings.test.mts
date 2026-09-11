import { beforeAll, describe, expect, it } from 'vitest'
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

describe('POST /api/v1/communities/:idOrSlug/warnings', () => {
  let moderator: PrivateUser
  let regularUser: PrivateUser
  let targetUser: PrivateUser
  let community: Community

  beforeAll(async () => {
    ;[moderator, regularUser, targetUser] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    community = await insertTestCommunity({ createdById: moderator.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .send({ userId: targetUser.id, reason: 'Test' })
      .expect(401)
  })

  it('returns 403 for non-moderator members', async () => {
    await insertTestCommunityMember({
      communityId: community.id,
      userId: regularUser.id,
      role: 'member',
    })
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .send({ userId: targetUser.id, reason: 'Test' })
      .expect(403)
  })

  it('returns 403 for users not in the community', async () => {
    const outsider = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(outsider)
    await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .send({ userId: targetUser.id, reason: 'Test' })
      .expect(403)
  })

  it('returns 415 when content-type is not json', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .set('Content-Type', 'text/plain')
      .send('not json')
      .expect(415)
  })

  it('returns 422 for missing userId', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .send({ reason: 'Test reason' })
      .expect(422)
  })

  it('returns 422 for missing reason', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .send({ userId: targetUser.id })
      .expect(422)
  })

  it('issues a community-scoped warning as a moderator', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    const response = await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .send({
        userId: targetUser.id,
        reason: 'Spam in community',
        publicMessage: 'Please read the community rules.',
      })
      .expect(201)

    expect(response.body.warning).toMatchObject({
      issued_by_id: moderator.id,
      community_id: community.id,
      reason: 'Spam in community',
      public_message: 'Please read the community rules.',
      report_id: null,
    })
    expect(response.body.warning.user_id).toBeUndefined()
    expect(response.body.warning.id).toBeDefined()
  })

  it('issues a warning with a linked report and resolves it as actioned', async () => {
    const postId = await insertTestPost({
      createdById: targetUser.id,
      slug: `community-warning-report-${crypto.randomUUID().slice(0, 8)}`,
      title: 'Post for community warning report',
      markdown: 'Content',
      communityId: community.id,
    })
    const reportId = await insertTestModerationReport({
      reporterUserId: regularUser.id,
      entityType: 'post',
      entityId: postId,
    })

    const request = createRequest()
    await request.authenticateAs(moderator)
    const response = await request
      .post(`/api/v1/communities/${community.slug}/warnings`)
      .send({
        userId: targetUser.id,
        reason: 'Spam post',
        reportId,
        resolveReport: true,
      })
      .expect(201)

    expect(response.body.warning).toMatchObject({
      community_id: community.id,
      report_id: reportId,
    })
    expect(response.body.warning.user_id).toBeUndefined()
  })
})
