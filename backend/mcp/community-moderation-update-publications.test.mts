import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestPost,
} from '@voucha/test-helpers'
import {
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
} from '@voucha/test-helpers/entities/community-post-reviews'
import { readAdminWorkflowTraining } from '@voucha/test-helpers/admin-workflow-fixtures'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import { callStructuredMcpTool, optionArgs } from '@voucha/test-helpers/mcp-tool-contract'
import { getPublicationReview } from '@services/communities/publications/access'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const

describe('community moderation MCP publication decisions — real PostgreSQL and Valkey', () => {
  it.each([
    { status: 'approved', initial: 'pending', expected: { approved_at: expect.any(Date) } },
    { status: 'rejected', initial: 'pending', expected: { rejected_at: expect.any(Date) } },
    {
      status: 'unpublished',
      initial: 'approved',
      expected: { unpublished_at: expect.any(Date) },
    },
  ] as const)(
    'records the $status decision without agent training feedback',
    async ({ status, initial, expected }) => {
      const moderator = await createTestPlusMcpCaller()
      const author = await createTestUser()
      const community = await insertTestCommunity({
        createdById: moderator.id,
        post_approval_required_at: new Date(),
      })
      await insertTestCommunityMember({
        communityId: community.id,
        userId: moderator.id,
        role: 'owner',
      })
      const postId = await insertTestPost({
        title: 'Community publication',
        slug: `training-publication-${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'A pending publication for moderation.',
        createdById: author.id,
        communityId: community.id,
      })
      if (initial === 'approved') {
        await insertTestCommunityPostReview({
          communityId: community.id,
          postId,
          submittedById: author.id,
        })
      } else {
        await insertTestPendingCommunityPostReview({
          communityId: community.id,
          postId,
          submittedById: author.id,
        })
      }
      expect(await readAdminWorkflowTraining(moderator.id)).toEqual([])

      const result = await callStructuredMcpTool(
        moderator,
        'update_community_moderation',
        optionArgs('moderate_post', {
          community: community.slug,
          postId,
          status,
        }),
        scopes,
      )

      expect(result).toEqual({ success: true })
      expect(await getPublicationReview(community.id, postId)).toMatchObject({
        ...expected,
        ...(status !== 'unpublished'
          ? { reviewed_by_id: moderator.id }
          : { unpublished_by_id: moderator.id }),
      })
      expect(await readAdminWorkflowTraining(moderator.id)).toEqual([])
    },
  )

  it('does not record training feedback for a platform moderator override', async () => {
    const moderator = await createTestPlusMcpCaller({ extraRoles: ['moderator'] })
    const author = await createTestUser()
    const community = await insertTestCommunity({
      createdById: moderator.id,
      post_approval_required_at: new Date(),
    })
    const postId = await insertTestPost({
      title: 'Pending platform-reviewed publication',
      slug: `training-platform-publication-${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'A pending publication for platform moderation.',
      createdById: author.id,
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: author.id,
    })

    await callStructuredMcpTool(
      moderator,
      'update_community_moderation',
      optionArgs('moderate_post', {
        community: community.slug,
        postId,
        status: 'approved',
        reason_code: 'staff_approved',
      }),
      scopes,
    )

    expect(await getPublicationReview(community.id, postId)).toMatchObject({
      platform_override_action: 'approve',
      platform_override_by_id: moderator.id,
    })
    expect(await readAdminWorkflowTraining(moderator.id)).toEqual([])
  })
})
