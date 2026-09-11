import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  removeTestCommunityMember,
  insertTestLocalFollow,
} from '@voucha/test-helpers'
import { updateUserFields } from '@services/users/update-fields'
import type { PrivateUser } from '@services/users/types'
import type { Community } from '../../types.mts'
import { listUserMemberCommunities, countUserMemberCommunities } from '../member-communities.mts'

describe('listUserMemberCommunities / countUserMemberCommunities', () => {
  let targetUser: PrivateUser
  let publicCommunity: Community
  let publicCommunity2: Community
  let viewer: PrivateUser
  let follower: PrivateUser

  beforeAll(async () => {
    targetUser = await createTestUser()
    viewer = await createTestUser()
    follower = await createTestUser()

    ;[publicCommunity, publicCommunity2] = await Promise.all([
      insertTestCommunity({ createdById: targetUser.id, visibility: 'public' }),
      insertTestCommunity({ createdById: targetUser.id, visibility: 'public' }),
    ])

    await Promise.all([
      updateUserFields(targetUser.id, { community_memberships_visibility: 'everyone' }),
      insertTestCommunityMember({
        communityId: publicCommunity.id,
        userId: targetUser.id,
        role: 'member',
      }),
      insertTestCommunityMember({
        communityId: publicCommunity2.id,
        userId: targetUser.id,
        role: 'member',
      }),
      insertTestLocalFollow(follower.id, targetUser.id),
    ])
  })

  describe('listUserMemberCommunities', () => {
    it('returns communities the user is a member of', async () => {
      const { results } = await listUserMemberCommunities(targetUser.id, null, { limit: 100 })
      const communityIds = results.map(r => r.community_id)
      expect(communityIds).toContain(publicCommunity.id)
      expect(communityIds).toContain(publicCommunity2.id)
    })

    it('returns empty array for users with no memberships', async () => {
      const { results } = await listUserMemberCommunities(viewer.id, null, { limit: 100 })
      expect(results).toHaveLength(0)
    })

    it('excludes removed memberships', async () => {
      const removedUser = await createTestUser()
      await updateUserFields(removedUser.id, { community_memberships_visibility: 'everyone' })
      const community = await insertTestCommunity({
        createdById: targetUser.id,
        visibility: 'public',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: removedUser.id,
        role: 'member',
      })
      await removeTestCommunityMember(community.id, removedUser.id)

      const { results } = await listUserMemberCommunities(removedUser.id, null, { limit: 100 })
      expect(results.map(r => r.community_id)).not.toContain(community.id)
    })

    it('respects visibility=everyone (anonymous access)', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'member',
      })

      const { results } = await listUserMemberCommunities(user.id, null, { limit: 100 })
      expect(results.map(r => r.community_id)).toContain(community.id)
    })

    it('hides memberships from anonymous when visibility=users', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'users' })
      const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'member',
      })

      const { results: anonResults } = await listUserMemberCommunities(user.id, null, {
        limit: 100,
      })
      expect(anonResults.map(r => r.community_id)).not.toContain(community.id)

      const { results: authResults } = await listUserMemberCommunities(user.id, viewer, {
        limit: 100,
      })
      expect(authResults.map(r => r.community_id)).toContain(community.id)
    })

    it('hides memberships from non-followers when visibility=followers', async () => {
      const user = await createTestUser()
      const localFollower = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'followers' })
      const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'member' }),
        insertTestLocalFollow(localFollower.id, user.id),
      ])

      const { results: strangerResults } = await listUserMemberCommunities(user.id, viewer, {
        limit: 100,
      })
      expect(strangerResults.map(r => r.community_id)).not.toContain(community.id)

      const { results: followerResults } = await listUserMemberCommunities(user.id, localFollower, {
        limit: 100,
      })
      expect(followerResults.map(r => r.community_id)).toContain(community.id)
    })

    it('allows owner to see own memberships regardless of visibility', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'nobody' })
      const community = await insertTestCommunity({
        createdById: user.id,
        visibility: 'private',
        member_roster_visibility: 'moderators',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'member',
      })

      const { results } = await listUserMemberCommunities(user.id, user, { limit: 100 })
      expect(results.map(r => r.community_id)).toContain(community.id)
    })
  })

  describe('countUserMemberCommunities', () => {
    it('allows owner to count own memberships regardless of visibility', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'nobody' })
      const community = await insertTestCommunity({
        createdById: user.id,
        visibility: 'private',
        member_roster_visibility: 'moderators',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'member',
      })

      const count = await countUserMemberCommunities(user.id, user)
      expect(count).toBe(1)
    })

    it('returns numeric count for anonymous viewer when visibility=everyone', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const c1 = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      const c2 = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      await Promise.all([
        insertTestCommunityMember({ communityId: c1.id, userId: user.id, role: 'member' }),
        insertTestCommunityMember({ communityId: c2.id, userId: user.id, role: 'member' }),
      ])

      const count = await countUserMemberCommunities(user.id, null)
      expect(typeof count).toBe('number')
      expect(count).toBeGreaterThanOrEqual(2)
    })

    it('returns 0 for anonymous when visibility=users', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'users' })
      const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'member',
      })

      const count = await countUserMemberCommunities(user.id, null)
      expect(count).toBe(0)
    })

    it('excludes removed memberships from count', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const community = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: user.id,
        role: 'member',
      })
      await removeTestCommunityMember(community.id, user.id)

      const count = await countUserMemberCommunities(user.id, null)
      expect(count).toBe(0)
    })

    it('excludes private communities from count for non-member anonymous viewer', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const pub = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      const priv = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
      await Promise.all([
        insertTestCommunityMember({ communityId: pub.id, userId: user.id, role: 'member' }),
        insertTestCommunityMember({ communityId: priv.id, userId: user.id, role: 'member' }),
      ])

      const count = await countUserMemberCommunities(user.id, null)
      expect(count).toBe(1)
    })

    it('includes private communities in count when viewer is a member', async () => {
      const user = await createTestUser()
      const memberViewer = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const pub = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      const priv = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
      await Promise.all([
        insertTestCommunityMember({ communityId: pub.id, userId: user.id, role: 'member' }),
        insertTestCommunityMember({ communityId: priv.id, userId: user.id, role: 'member' }),
        insertTestCommunityMember({
          communityId: priv.id,
          userId: memberViewer.id,
          role: 'member',
        }),
      ])

      const countForNonMember = await countUserMemberCommunities(user.id, viewer)
      expect(countForNonMember).toBe(1)

      const countForMember = await countUserMemberCommunities(user.id, memberViewer)
      expect(countForMember).toBe(2)
    })

    it('admin sees all communities including private', async () => {
      const user = await createTestUser()
      const admin = await createTestUser({ administrator: true })
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const pub = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      const priv = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
      await Promise.all([
        insertTestCommunityMember({ communityId: pub.id, userId: user.id, role: 'member' }),
        insertTestCommunityMember({ communityId: priv.id, userId: user.id, role: 'member' }),
      ])

      const count = await countUserMemberCommunities(user.id, admin)
      expect(count).toBe(2)
    })

    it('excludes moderators-only roster community from count for regular member', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const pubRoster = await insertTestCommunity({ createdById: user.id, visibility: 'public' })
      const modRoster = await insertTestCommunity({
        createdById: user.id,
        visibility: 'public',
        member_roster_visibility: 'moderators',
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: pubRoster.id, userId: user.id, role: 'member' }),
        insertTestCommunityMember({ communityId: modRoster.id, userId: user.id, role: 'member' }),
      ])

      const count = await countUserMemberCommunities(user.id, null)
      expect(count).toBe(1)
    })

    it('counts owner role even in moderators-only roster community', async () => {
      const user = await createTestUser()
      await updateUserFields(user.id, { community_memberships_visibility: 'everyone' })
      const modRoster = await insertTestCommunity({
        createdById: user.id,
        visibility: 'public',
        member_roster_visibility: 'moderators',
      })
      await insertTestCommunityMember({ communityId: modRoster.id, userId: user.id, role: 'owner' })

      const count = await countUserMemberCommunities(user.id, null)
      expect(count).toBe(1)
    })
  })
})
