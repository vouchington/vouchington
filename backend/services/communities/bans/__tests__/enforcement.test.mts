import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
  insertTestCommunityApplication,
  insertTestPendingCommunityPostReview,
  insertTestPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createRandomString } from '@voucha/test-helpers/data'
import { joinCommunity } from '../../members/join.mts'
import { createApplication } from '../../applications/create.mts'
import { redeemInviteCode } from '../../invites/redeem.mts'
import { approveApplication } from '../../applications/review.mts'
import { approvePublication } from '../../publications/moderate.mts'
import { banUserFromCommunity } from '../create.mts'

// Post-creation/comment ban enforcement lives in
// @services/posts/__tests__/community-ban-enforcement.test.mts instead: those cases call the
// real createPost, which communities must not depend on.
describe('community ban enforcement', () => {
  describe('join enforcement', () => {
    it('banned user cannot join', async () => {
      const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        visibility: 'public',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      await banUserFromCommunity(owner!, community.id, user!.id)

      await expect(joinCommunity(user!.id, community.id)).rejects.toMatchObject({
        status: 403,
        code: 'COMMUNITY_BANNED',
      })
    })
  })

  describe('application enforcement', () => {
    it('banned user cannot apply to private community', async () => {
      const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      await banUserFromCommunity(owner!, community.id, user!.id)

      await expect(
        createApplication(WEB_PROVENANCE, user!.id, community.id, {}),
      ).rejects.toMatchObject({
        status: 403,
        code: 'COMMUNITY_BANNED',
      })
    })
  })

  describe('invite-redemption enforcement', () => {
    it('banned user cannot redeem an invite to rejoin', async () => {
      const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner!.id,
        invitedUserId: user!.id,
      })
      await banUserFromCommunity(owner!, community.id, user!.id)

      await expect(redeemInviteCode(user!.id, invite.code)).rejects.toMatchObject({
        status: 403,
        code: 'COMMUNITY_BANNED',
      })
    })
  })

  describe('application-approval enforcement', () => {
    it('moderator cannot approve an application for a banned user', async () => {
      const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        visibility: 'private',
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: owner!.id,
        role: 'owner',
      })
      const application = await insertTestCommunityApplication({
        communityId: community.id,
        userId: user!.id,
      })
      await banUserFromCommunity(owner!, community.id, user!.id)

      await expect(approveApplication(owner!, application.id)).rejects.toMatchObject({
        status: 403,
        code: 'COMMUNITY_BANNED',
      })
    })
  })

  describe('publication-approval enforcement', () => {
    it('moderator cannot approve a banned user pending post', async () => {
      const [owner, user] = await Promise.all([createTestUser(), createTestUser()])
      const community = await insertTestCommunity({
        createdById: owner!.id,
        slug: `ban-pub-${createRandomString(8)}`,
        visibility: 'public',
        post_approval_required_at: new Date(),
      })
      await Promise.all([
        insertTestCommunityMember({ communityId: community.id, userId: owner!.id, role: 'owner' }),
        insertTestCommunityMember({ communityId: community.id, userId: user!.id }),
      ])
      const postId = await insertTestPost({
        title: `Pending ban post ${createRandomString(8)}`,
        slug: `ban-pending-${createRandomString(8)}`,
        createdById: user!.id,
        markdown: 'content',
        communityId: community.id,
      })
      await insertTestPendingCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: user!.id,
      })

      await banUserFromCommunity(owner!, community.id, user!.id)

      await expect(approvePublication(owner!, community.id, postId)).rejects.toMatchObject({
        status: 403,
        code: 'COMMUNITY_BANNED',
      })
    })
  })
})
