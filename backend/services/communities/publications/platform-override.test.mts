import { beforeAll, describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers/entities/community-post-reviews'
import type { Community } from '../types.mts'
import type { PrivateUser } from '@services/users/types'
import { getPublicationReview, getPublicationReviewChanges } from './access.mts'
import { overridePublication } from './platform-override.mts'
import { approvePublication, rejectPublication } from './moderate.mts'
import { unpublishPost } from './unpublish.mts'

describe('platform publication overrides', () => {
  let owner: PrivateUser
  let member: PrivateUser
  let siteModerator: PrivateUser
  let community: Community

  async function insertPost(pending: boolean): Promise<string> {
    const value = createRandomString(8)
    const postId = await insertTestPost({
      title: `Platform override ${value}`,
      slug: `platform-override-${value}`,
      markdown: 'Community publication content',
      createdById: member.id,
      communityId: community.id,
    })
    if (pending) {
      await insertTestPendingCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: member.id,
      })
    } else {
      await insertTestCommunityPostReview({
        communityId: community.id,
        postId,
        submittedById: member.id,
      })
    }
    return postId
  }

  beforeAll(async () => {
    ;[owner, member, siteModerator] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    community = await insertTestCommunity({
      createdById: owner.id,
      post_approval_required_at: new Date(),
    })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('lets site moderators override a community decision and prevents a community owner from reversing it', async () => {
    const postId = await insertPost(true)
    await rejectPublication(owner, community.id, postId, 'Not relevant')
    await overridePublication(siteModerator, community.id, postId, {
      action: 'approve',
      reasonCode: 'appeal_upheld',
      privateNote: 'Reviewed platform policy context',
    })

    await expect(unpublishPost(owner, community.id, postId)).rejects.toMatchObject({ status: 403 })
    await expect(getPublicationReview(community.id, postId)).resolves.toMatchObject({
      approved_at: expect.any(Date),
      rejected_at: null,
      platform_override_action: 'approve',
      platform_override_reason_code: 'appeal_upheld',
    })
  })

  it('restores an unpublished publication and preserves both events', async () => {
    const postId = await insertPost(false)
    await unpublishPost(owner, community.id, postId)
    await overridePublication(siteModerator, community.id, postId, {
      action: 'restore',
      reasonCode: 'staff_restored',
      privateNote: 'The original removal was overturned',
    })

    await expect(getPublicationReview(community.id, postId)).resolves.toMatchObject({
      approved_at: expect.any(Date),
      unpublished_at: null,
      platform_override_action: 'restore',
      platform_override_by_id: siteModerator.id,
    })
    await expect(getPublicationReviewChanges(community.id, postId)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'unpublish', platform_override: false }),
        expect.objectContaining({
          action: 'restore',
          platform_override: true,
          reason_code: 'staff_restored',
          private_note: 'The original removal was overturned',
        }),
      ]),
    )
  })

  it('routes platform staff through overrides from the community moderation entry points', async () => {
    const approvePostId = await insertPost(true)
    const rejectPostId = await insertPost(true)
    const unpublishPostId = await insertPost(false)

    await approvePublication(siteModerator, community.id, approvePostId)
    await rejectPublication(siteModerator, community.id, rejectPostId, 'Private staff context')
    await unpublishPost(siteModerator, community.id, unpublishPostId)

    await expect(getPublicationReview(community.id, approvePostId)).resolves.toMatchObject({
      platform_override_action: 'approve',
      platform_override_reason_code: 'staff_approved',
    })
    await expect(getPublicationReview(community.id, rejectPostId)).resolves.toMatchObject({
      platform_override_action: 'reject',
      platform_override_private_note: 'Private staff context',
      platform_override_reason_code: 'staff_rejected',
    })
    await expect(getPublicationReview(community.id, unpublishPostId)).resolves.toMatchObject({
      platform_override_action: 'unpublish',
      platform_override_reason_code: 'staff_unpublished',
    })
  })
})
