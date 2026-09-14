import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createRandomString,
  createTestUser,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'

describe('Community member roster privacy', () => {
  it('hides regular members by user membership privacy while owners and moderators stay visible', async () => {
    const [owner, moderator, regularMember] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `members-user-privacy-${random}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: moderator!.id,
        role: 'moderator',
      }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: regularMember!.id,
        role: 'member',
      }),
      updateUserFields(owner!.id, { community_memberships_visibility: 'nobody' }),
      updateUserFields(moderator!.id, { community_memberships_visibility: 'nobody' }),
      updateUserFields(regularMember!.id, { community_memberships_visibility: 'nobody' }),
    ])

    const anonymousResponse = await createRequest()
      .get(`/api/v1/communities/${community.slug}/members`)
      .expect(200)
    const anonymousUserIds = visibleRosterUserIds(anonymousResponse.body)
    expect(anonymousUserIds).toContain(owner!.id)
    expect(anonymousUserIds).toContain(moderator!.id)
    expect(anonymousUserIds).not.toContain(regularMember!.id)

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner!)
    const ownerResponse = await ownerRequest
      .get(`/api/v1/communities/${community.slug}/members`)
      .expect(200)
    expect(visibleRosterUserIds(ownerResponse.body)).toContain(regularMember!.id)
  })

  it('applies mutual-follower user membership privacy to regular members', async () => {
    const [owner, regularMember, stranger, follower, mutualFollower] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    const random = createRandomString(8)
    const community = await insertTestCommunity({
      createdById: owner!.id,
      slug: `members-follower-privacy-${random}`,
    })
    await Promise.all([
      insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
      insertTestCommunityMember({
        communityId: community.id,
        userId: regularMember!.id,
        role: 'member',
      }),
      updateUserFields(regularMember!.id, {
        community_memberships_visibility: 'mutual_followers',
      }),
      insertEntityRelation('relation__user__follow__user', follower!.id, regularMember!.id),
      insertEntityRelation('relation__user__follow__user', mutualFollower!.id, regularMember!.id),
      insertEntityRelation('relation__user__follow__user', regularMember!.id, mutualFollower!.id),
    ])

    for (const viewer of [stranger!, follower!]) {
      const request = createRequest()
      await request.authenticateAs(viewer)
      const response = await request
        .get(`/api/v1/communities/${community.slug}/members`)
        .expect(200)
      expect(visibleRosterUserIds(response.body)).not.toContain(regularMember!.id)
    }

    const mutualRequest = createRequest()
    await mutualRequest.authenticateAs(mutualFollower!)
    const mutualResponse = await mutualRequest
      .get(`/api/v1/communities/${community.slug}/members`)
      .expect(200)
    expect(visibleRosterUserIds(mutualResponse.body)).toContain(regularMember!.id)
  })

  it('applies community roster visibility tiers to regular members', async () => {
    const [owner, moderator, regularMember, viewerMember, stranger, admin] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser(),
      createTestUser({ administrator: true }),
    ])
    const random = createRandomString(8)
    const users = {
      moderatorId: moderator!.id,
      ownerId: owner!.id,
      regularMemberId: regularMember!.id,
      viewerMemberId: viewerMember!.id,
    }
    const usersCommunity = await createRosterVisibilityCommunity(
      `members-roster-users-${random}`,
      'users',
      users,
    )
    const membersCommunity = await createRosterVisibilityCommunity(
      `members-roster-members-${random}`,
      'members',
      users,
    )
    const moderatorsCommunity = await createRosterVisibilityCommunity(
      `members-roster-mods-${random}`,
      'moderators',
      users,
    )

    const anonymousUsersResponse = await createRequest()
      .get(`/api/v1/communities/${usersCommunity.slug}/members`)
      .expect(200)
    expect(visibleRosterUserIds(anonymousUsersResponse.body)).not.toContain(regularMember!.id)

    const strangerRequest = createRequest()
    await strangerRequest.authenticateAs(stranger!)
    const signedInUsersResponse = await strangerRequest
      .get(`/api/v1/communities/${usersCommunity.slug}/members`)
      .expect(200)
    expect(visibleRosterUserIds(signedInUsersResponse.body)).toContain(regularMember!.id)

    const signedInMembersResponse = await strangerRequest
      .get(`/api/v1/communities/${membersCommunity.slug}/members`)
      .expect(200)
    expect(visibleRosterUserIds(signedInMembersResponse.body)).not.toContain(regularMember!.id)

    const memberRequest = createRequest()
    await memberRequest.authenticateAs(viewerMember!)
    const memberResponse = await memberRequest
      .get(`/api/v1/communities/${membersCommunity.slug}/members`)
      .expect(200)
    expect(visibleRosterUserIds(memberResponse.body)).toContain(regularMember!.id)

    const regularMemberResponse = await memberRequest
      .get(`/api/v1/communities/${moderatorsCommunity.slug}/members`)
      .expect(200)
    expect(visibleRosterUserIds(regularMemberResponse.body)).not.toContain(regularMember!.id)

    for (const viewer of [moderator!, admin!]) {
      const request = createRequest()
      await request.authenticateAs(viewer)
      const response = await request
        .get(`/api/v1/communities/${moderatorsCommunity.slug}/members`)
        .expect(200)
      expect(visibleRosterUserIds(response.body)).toContain(regularMember!.id)
    }
  })
})

function visibleRosterUserIds(body: {
  community_members: Record<string, { user_id: string }>
}): string[] {
  return Object.values(body.community_members).map(member => member.user_id)
}

async function createRosterVisibilityCommunity(
  slug: string,
  memberRosterVisibility: 'public' | 'users' | 'members' | 'moderators',
  users: {
    moderatorId: string
    ownerId: string
    regularMemberId: string
    viewerMemberId: string
  },
) {
  const community = await insertTestCommunity({
    createdById: users.ownerId,
    member_roster_visibility: memberRosterVisibility,
    slug,
  })
  await Promise.all([
    insertTestCommunityMember({ communityId: community.id, userId: users.ownerId, role: 'owner' }),
    insertTestCommunityMember({
      communityId: community.id,
      userId: users.moderatorId,
      role: 'moderator',
    }),
    insertTestCommunityMember({
      communityId: community.id,
      userId: users.regularMemberId,
      role: 'member',
    }),
    insertTestCommunityMember({
      communityId: community.id,
      userId: users.viewerMemberId,
      role: 'member',
    }),
  ])
  return community
}
