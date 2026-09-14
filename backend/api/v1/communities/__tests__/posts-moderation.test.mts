import { describe, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { createCommunityPostFixture } from '@services/posts/test-support'

describe('community post moderation routes', () => {
  it('routes every community-moderator action and rejects platform-only status values', async () => {
    const moderator = await createTestUser()
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: moderator.id,
      slug: `posts-moderation-actions-${random}`,
      post_approval_required_at: new Date(),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'owner',
    })
    const rejected = await createCommunityPostFixture(moderator, community.id, {
      title: `Post To Reject ${random}`,
      markdown: 'reject content',
    })
    const unpublished = await createCommunityPostFixture(moderator, community.id, {
      title: `Post To Unpublish ${random}`,
      markdown: 'unpublish content',
    })

    const request = createRequest()
    await request.authenticateAs(moderator)
    await request
      .patch(`/api/v1/communities/${community.slug}/posts/${rejected.id}`)
      .send({ status: 'rejected', reason: 'Not relevant' })
      .expect(204)
    await request
      .patch(`/api/v1/communities/${community.slug}/posts/${unpublished.id}`)
      .send({ status: 'approved' })
      .expect(204)
    await request
      .patch(`/api/v1/communities/${community.slug}/posts/${unpublished.id}`)
      .send({ status: 'unpublished' })
      .expect(204)
    await request
      .patch(`/api/v1/communities/${community.slug}/posts/${unpublished.id}`)
      .send({ status: 'restored' })
      .expect(422)
  })

  it('maps every platform-staff publication status', async () => {
    const [owner, siteModerator] = await Promise.all([
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner.id,
      slug: `posts-moderation-staff-actions-${random}`,
      post_approval_required_at: new Date(),
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: owner.id,
      role: 'owner',
    })
    const post = await createCommunityPostFixture(owner, community.id, {
      title: `Post Staff Action Mapping ${random}`,
      markdown: 'platform action content',
    })

    const request = createRequest()
    await request.authenticateAs(siteModerator)
    for (const status of ['rejected', 'unpublished', 'restored'] as const) {
      await request
        .patch(`/api/v1/communities/${community.slug}/posts/${post.id}`)
        .send({ status, reason_code: `staff_${status}` })
        .expect(204)
    }
    await request
      .patch(`/api/v1/communities/${community.slug}/posts/${post.id}`)
      .send({ status: 'unknown', reason_code: 'staff_unknown' })
      .expect(422)
  })
})
