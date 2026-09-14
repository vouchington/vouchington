import { beforeAll, describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestMembership,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  updateTestCommunityMemberRole,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/communities/:idOrSlug/moderation-transparency', () => {
  let community: { id: string; slug: string }
  let owner: PrivateUser
  let freeMember: PrivateUser
  let freeModerator: PrivateUser
  let activePlusMember: PrivateUser
  let pastDueProMember: PrivateUser
  let pausedPlusMember: PrivateUser
  let cancelledProMember: PrivateUser

  beforeAll(async () => {
    ;[
      owner,
      freeMember,
      freeModerator,
      activePlusMember,
      pastDueProMember,
      pausedPlusMember,
      cancelledProMember,
    ] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    community = await insertTestCommunity({ createdById: owner.id })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' }),
      insertTestCommunityMember({ communityId: community.id, userId: freeMember.id }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: freeModerator.id,
        role: 'moderator',
      }),
      ...[activePlusMember, pastDueProMember, pausedPlusMember, cancelledProMember].map(user =>
        insertTestCommunityMember({ communityId: community.id, userId: user.id }),
      ),
      createTestMembership({ user_id: activePlusMember.id, plan: 'plus', status: 'active' }),
      createTestMembership({ user_id: pastDueProMember.id, plan: 'pro', status: 'past_due' }),
      createTestMembership({ user_id: pausedPlusMember.id, plan: 'plus', status: 'paused' }),
      createTestMembership({ user_id: cancelledProMember.id, plan: 'pro', status: 'cancelled' }),
    ])
  })

  it('requires authentication and the canonical community moderation-results scope', async () => {
    await createRequest()
      .get(`/api/v1/communities/${community.slug}/moderation-transparency`)
      .expect(401)

    const moderatorRequest = createRequest()
    await moderatorRequest.authenticateAs(freeModerator)
    await moderatorRequest
      .get(`/api/v1/communities/${community.slug}/moderation-transparency`)
      .expect(200)

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    const response = await ownerRequest
      .get(`/api/v1/communities/${community.slug}/moderation-transparency?range=invalid`)
      .expect(200)
    expect(response.body).toEqual({ range: '30d', buckets: expect.any(Array) })
  })

  it('allows active and past-due paid community members but denies paused and cancelled members', async () => {
    for (const user of [activePlusMember, pastDueProMember]) {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(`/api/v1/communities/${community.slug}/moderation-transparency`).expect(200)
    }
    for (const user of [pausedPlusMember, cancelledProMember]) {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get(`/api/v1/communities/${community.slug}/moderation-transparency`).expect(403)
    }
  })

  it('denies an ordinary Free community member', async () => {
    const request = createRequest()
    await request.authenticateAs(freeMember)
    await request.get(`/api/v1/communities/${community.slug}/moderation-transparency`).expect(403)
  })

  it('denies a community member whose active paid membership has expired', async () => {
    const user = await createTestUser()
    await insertTestCommunityMember({ communityId: community.id, userId: user.id })
    const membership = await createTestMembership({
      user_id: user.id,
      plan: 'pro',
      status: 'active',
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 1_000))

    const request = createRequest()
    await request.authenticateAs(user)
    await request.get(`/api/v1/communities/${community.slug}/moderation-transparency`).expect(403)
  })

  it('masks a private community from a nonmember', async () => {
    const privateCommunity = await insertTestCommunity({
      createdById: owner.id,
      visibility: 'private',
    })
    const request = createRequest()
    await request.authenticateAs(freeMember)
    await request
      .get(`/api/v1/communities/${privateCommunity.slug}/moderation-transparency`)
      .expect(404)
  })

  it('masks a private community from its removed former creator after ownership transfer', async () => {
    const [formerOwner, successor] = await Promise.all([createTestUser(), createTestUser()])
    const privateCommunity = await insertTestCommunity({
      createdById: formerOwner.id,
      visibility: 'private',
    })
    await Promise.all([
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: formerOwner.id,
        role: 'owner',
      }),
      insertTestCommunityMember({
        communityId: privateCommunity.id,
        userId: successor.id,
        role: 'member',
      }),
    ])
    await updateTestCommunityMemberRole(privateCommunity.id, formerOwner.id, 'member')
    await updateTestCommunityMemberRole(privateCommunity.id, successor.id, 'owner')
    await removeTestCommunityMember(privateCommunity.id, formerOwner.id)

    const request = createRequest()
    await request.authenticateAs(formerOwner)
    await request
      .get(`/api/v1/communities/${privateCommunity.slug}/moderation-transparency`)
      .expect(404)
  })

  it('returns not found for an authenticated user requesting a nonexistent community', async () => {
    const request = createRequest()
    await request.authenticateAs(owner)
    await request.get('/api/v1/communities/does-not-exist/moderation-transparency').expect(404)
  })

  it('returns 400 for an all-time cursor beyond the UUIDv7 timestamp range', async () => {
    const request = createRequest()
    await request.authenticateAs(owner)
    const after = encodeCursor({
      timestamp: 0x1_0000_0000_0000,
      id: '0191ef72-7fd9-7000-8000-000000000001',
      scope: `moderation-transparency:community:${community.id}:month-desc`,
    })

    await request
      .get(`/api/v1/communities/${community.slug}/moderation-transparency?range=all&after=${after}`)
      .expect(400)
  })
})
