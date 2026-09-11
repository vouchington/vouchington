import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestUserWarning,
  insertTestCommunityBan,
  insertTestCommunity,
  insertTestPost,
  getPostClearanceStatus,
  getTestActiveCommunityBan,
  insertTestCommunityPostReview,
  updateTestCommunityPostReviewState,
  getCommunityPostReviewStatus,
  getTestPostPublicationDirtyWorkForScope,
  listTestPostPublicationImpactCommunityIds,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { createModerationAppeal } from './create.mts'
import { parseCreateModerationAppealInput } from './parse.mts'
import { resolveModerationAppealAccept } from './resolve.mts'
import { deliverModerationAppealForTest } from './resolution.test-helpers.mts'

describe('resolve moderation appeals', () => {
  let staff: PrivateUser
  let appellant: PrivateUser

  beforeAll(async () => {
    staff = await createTestUser()
    appellant = await createTestUser()
  })

  async function createWarningAppeal() {
    const warning = await insertTestUserWarning({
      userId: appellant.id,
      issuedById: staff.id,
      reason: 'spam',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'warning',
      target_id: warning.id,
      appeal_reason: 'I did not spam.',
    })
    const { appeal } = await createModerationAppeal(appellant, input)
    return { appeal, warning }
  }

  async function openWarningAppeal() {
    const result = await createWarningAppeal()
    await deliverModerationAppealForTest(staff.id, result.appeal.id)
    return result
  }

  async function openBanAppeal() {
    const community = await insertTestCommunity({
      name: `Resolve Community ${crypto.randomUUID().slice(0, 8)}`,
      slug: `resolve-community-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const ban = await insertTestCommunityBan({
      communityId: community.id,
      userId: appellant.id,
      bannedById: staff.id,
      reason: 'Violations',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'ban',
      target_id: ban.id,
      appeal_reason: 'I understand the rules now.',
    })
    const { appeal } = await createModerationAppeal(appellant, input)
    await deliverModerationAppealForTest(staff.id, appeal.id)
    return { appeal, ban, community }
  }

  async function openPostRemovalAppeal() {
    const postId = await insertTestPost({
      title: `Resolve Removal Post ${crypto.randomUUID().slice(0, 8)}`,
      slug: `resolve-removal-${crypto.randomUUID().slice(0, 8)}`,
      createdById: appellant.id,
      markdown: 'My post content',
      clearanceStatus: 'rejected',
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'removal',
      target_id: postId,
      appeal_reason: 'My post was wrongly removed.',
    })
    const { appeal } = await createModerationAppeal(appellant, input)
    await deliverModerationAppealForTest(staff.id, appeal.id)
    return { appeal, postId }
  }

  async function openCommunityRemovedPostAppeal() {
    const community = await insertTestCommunity({
      name: `CommRemoval ${crypto.randomUUID().slice(0, 8)}`,
      slug: `comm-removal-${crypto.randomUUID().slice(0, 8)}`,
      createdById: staff.id,
    })
    const postId = await insertTestPost({
      title: `CommunityRemoval ${crypto.randomUUID().slice(0, 8)}`,
      slug: `comm-rem-${crypto.randomUUID().slice(0, 8)}`,
      createdById: appellant.id,
      markdown: 'Post content',
      clearanceStatus: 'pending',
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      unpublishedAt: new Date(),
    })
    const input = parseCreateModerationAppealInput({
      target_type: 'removal',
      target_id: postId,
      appeal_reason: 'Wrong community removal.',
    })
    const { appeal } = await createModerationAppeal(appellant, input)
    await deliverModerationAppealForTest(staff.id, appeal.id)
    return { appeal, postId, communityId: community.id }
  }

  describe('resolveModerationAppealAccept', () => {
    it('sets status=resolved and resolution_action=accept', async () => {
      const { appeal } = await openWarningAppeal()
      const resolved = await resolveModerationAppealAccept(staff.id, appeal.id)
      expect(resolved.status).toBe('resolved')
      expect(resolved.resolution_action).toBe('accept')
      expect(resolved.resolved_at).not.toBeNull()
      expect(resolved.resolved_by_id).toBe(staff.id)
      expect(resolved.created_at).toBeInstanceOf(Date)
    })

    it('revokes the user warning when accepting a warning appeal', async () => {
      const warning = await insertTestUserWarning({
        userId: appellant.id,
        issuedById: staff.id,
        reason: 'abuse',
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'Abuse was not correct.',
      })
      const { appeal } = await createModerationAppeal(appellant, input)
      await deliverModerationAppealForTest(staff.id, appeal.id)
      await resolveModerationAppealAccept(staff.id, appeal.id)

      // Warning should now be revoked — verify via a 404 when trying to appeal it again
      const retryInput = parseCreateModerationAppealInput({
        target_type: 'warning',
        target_id: warning.id,
        appeal_reason: 'Retry after revoke.',
      })
      await expect(createModerationAppeal(appellant, retryInput)).rejects.toMatchObject({
        status: 404,
      })
    })

    it('lifts the community ban when accepting a ban appeal', async () => {
      const { appeal, community } = await openBanAppeal()
      await resolveModerationAppealAccept(staff.id, appeal.id)

      // Ban should now be lifted — no active ban remains
      const activeBan = await getTestActiveCommunityBan(community.id, appellant.id)
      expect(activeBan).toBeNull()
    })

    it('approves the post when accepting a post removal appeal', async () => {
      const { appeal, postId } = await openPostRemovalAppeal()
      const resolved = await resolveModerationAppealAccept(staff.id, appeal.id)
      expect(await getPostClearanceStatus(postId)).toBe('approved')
      expect(resolved.target_context).toEqual(appeal.target_context)
      expect(resolved.staff_context?.original_decision).toEqual(
        appeal.staff_context?.original_decision,
      )
    })

    it('clears community unpublish when accepting a community-removal post appeal', async () => {
      const { appeal, postId, communityId } = await openCommunityRemovedPostAppeal()
      const resolved = await resolveModerationAppealAccept(staff.id, appeal.id)
      const status = await getCommunityPostReviewStatus(communityId, postId)
      expect(status?.unpublished_at).toBeNull()
      const dirtyWork = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
      expect(dirtyWork).toMatchObject({ post_id: postId })
      await expect(listTestPostPublicationImpactCommunityIds(dirtyWork!.id)).resolves.toContain(
        communityId,
      )
      expect(resolved.target_context).toEqual(appeal.target_context)
      expect(resolved.staff_context?.original_decision).toEqual(
        appeal.staff_context?.original_decision,
      )
    })

    it('does not clear community unpublish when accepting a platform-removal post appeal', async () => {
      // A post removed by platform AND community: accepting the platform appeal
      // must not touch the community unpublish row (post_removal_kind='platform').
      const community = await insertTestCommunity({
        name: `PlatformRemoval ${crypto.randomUUID().slice(0, 8)}`,
        slug: `plat-removal-${crypto.randomUUID().slice(0, 8)}`,
        createdById: staff.id,
      })
      const postId = await insertTestPost({
        title: `PlatformRemoval ${crypto.randomUUID().slice(0, 8)}`,
        slug: `plat-rem-${crypto.randomUUID().slice(0, 8)}`,
        createdById: appellant.id,
        markdown: 'Post content',
        clearanceStatus: 'rejected',
      })
      await insertTestCommunityPostReview({ communityId: community.id, postId })
      await updateTestCommunityPostReviewState({
        communityId: community.id,
        postId,
        unpublishedAt: new Date(),
      })
      // rejected_at is set → post_removal_kind='platform'
      const input = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'Platform removal was wrong.',
      })
      const { appeal } = await createModerationAppeal(appellant, input)
      await deliverModerationAppealForTest(staff.id, appeal.id)
      await resolveModerationAppealAccept(staff.id, appeal.id)
      // Clearance should now be approved
      expect(await getPostClearanceStatus(postId)).toBe('approved')
      // Community unpublish must NOT have been touched
      const status = await getCommunityPostReviewStatus(community.id, postId)
      expect(status?.unpublished_at).not.toBeNull()
    })

    it('does not change clearance status when accepting a community-removal post appeal', async () => {
      const { appeal, postId, communityId } = await openCommunityRemovedPostAppeal()
      await resolveModerationAppealAccept(staff.id, appeal.id)
      const clearance = await getPostClearanceStatus(postId)
      expect(clearance).not.toBe('approved')
      const status = await getCommunityPostReviewStatus(communityId, postId)
      expect(status?.unpublished_at).toBeNull()
    })

    it('respects explicit post_removal_kind=community when post has both platform and community removals', async () => {
      const community = await insertTestCommunity({
        name: `BothRemovals ${crypto.randomUUID().slice(0, 8)}`,
        slug: `both-rem-${crypto.randomUUID().slice(0, 8)}`,
        createdById: staff.id,
      })
      const postId = await insertTestPost({
        title: `BothRemovals ${crypto.randomUUID().slice(0, 8)}`,
        slug: `both-rem-post-${crypto.randomUUID().slice(0, 8)}`,
        createdById: appellant.id,
        markdown: 'Post content',
        clearanceStatus: 'rejected',
      })
      await insertTestCommunityPostReview({ communityId: community.id, postId })
      await updateTestCommunityPostReviewState({
        communityId: community.id,
        postId,
        unpublishedAt: new Date(),
      })
      const input = parseCreateModerationAppealInput({
        target_type: 'removal',
        target_id: postId,
        appeal_reason: 'Community removal was wrong.',
        post_removal_kind: 'community',
      })
      const { appeal } = await createModerationAppeal(appellant, input)
      await deliverModerationAppealForTest(staff.id, appeal.id)
      await resolveModerationAppealAccept(staff.id, appeal.id)
      const status = await getCommunityPostReviewStatus(community.id, postId)
      expect(status?.unpublished_at).toBeNull()
      expect(await getPostClearanceStatus(postId)).not.toBe('approved')
    })

    it('throws 404 when resolving an already resolved appeal', async () => {
      const { appeal } = await openWarningAppeal()
      await resolveModerationAppealAccept(staff.id, appeal.id)
      await expect(resolveModerationAppealAccept(staff.id, appeal.id)).rejects.toMatchObject({
        status: 404,
      })
    })
  })
})
