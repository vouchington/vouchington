import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createRandomString,
  createTestUser,
  archiveTestCommunity,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'

describe('PATCH /api/v1/communities/:idOrSlug/post-type-settings', () => {
  it('returns 401 without auth', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    const request = createRequest()

    await request
      .patch(`/api/v1/communities/${community.slug}/post-type-settings`)
      .send({ allow_review_posts: true })
      .expect(401)
  })

  it('returns 403 for regular members', async () => {
    const [owner, member] = await Promise.all([createTestUser(), createTestUser()])
    const community = await insertTestCommunity({ createdById: owner!.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: member!.id,
      role: 'member',
    })
    const request = createRequest()
    await request.authenticateAs(member!)

    await request
      .patch(`/api/v1/communities/${community.slug}/post-type-settings`)
      .send({ allow_review_posts: true })
      .expect(403)
  })

  it('updates review and data point post flags for moderators', async () => {
    const [owner, moderator] = await Promise.all([createTestUser(), createTestUser()])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `post-type-settings-${random}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator!.id,
      role: 'moderator',
    })
    const request = createRequest()
    await request.authenticateAs(moderator!)

    const response = await request
      .patch(`/api/v1/communities/${community.slug}/post-type-settings`)
      .send({ allow_review_posts: true, allow_data_point_posts: true })
      .expect(200)

    expect(response.body.community).toMatchObject({
      id: community.id,
      allow_review_posts: true,
      allow_data_point_posts: true,
    })
  })

  it('validates post-type setting payloads', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)

    await request
      .patch(`/api/v1/communities/${community.slug}/post-type-settings`)
      .send({ allow_review_posts: 'yes' })
      .expect(422)
  })

  it('returns 403 for archived communities', async () => {
    const owner = await createTestUser()
    const community = await insertTestCommunity({ createdById: owner.id })
    await archiveTestCommunity({ communityId: community.id, archivedById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const request = createRequest()
    await request.authenticateAs(owner)

    await request
      .patch(`/api/v1/communities/${community.slug}/post-type-settings`)
      .send({ allow_review_posts: true })
      .expect(403)
  })
})
