import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPost,
} from '@voucha/test-helpers'
import { createTestPlusMcpCaller } from '@voucha/test-helpers/mcp-plus-caller'
import {
  callRejectedMcpTool,
  callStructuredMcpTool,
  optionArgs,
} from '@voucha/test-helpers/mcp-tool-contract'
import { getPinnedPosts } from '@services/communities/publications/pinned'

const scopes = ['community-moderation:read', 'community-moderation:write'] as const

describe('community moderation MCP pinned-post updates — real PostgreSQL and Valkey', () => {
  it('sets and clears approved pins with the REST moderator guard', async () => {
    const moderator = await createTestPlusMcpCaller()
    const member = await createTestUser()
    const community = await insertTestCommunity({ createdById: moderator.id })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: moderator.id,
      role: 'moderator',
    })
    await insertTestCommunityMember({ communityId: community.id, userId: member.id })
    const postId = await insertTestPost({
      title: 'Pinned post',
      slug: `mcp-pin-${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'Approved post body',
      createdById: moderator.id,
      communityId: community.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId,
      submittedById: moderator.id,
    })
    const args = optionArgs('set_pinned_posts', { community: community.slug, post_ids: [postId] })
    expect(
      await callRejectedMcpTool(
        { ...member, membership_plan: 'plus' },
        'update_community_moderation',
        args,
        scopes,
      ),
    ).toContain('Forbidden')
    expect(
      await callRejectedMcpTool(
        { ...moderator, membership_plan: null },
        'update_community_moderation',
        args,
        scopes,
      ),
    ).toContain('requires a higher plan')

    const added = await callStructuredMcpTool(
      moderator,
      'update_community_moderation',
      args,
      scopes,
    )
    expect(added.pinned_posts).toEqual([
      expect.objectContaining({
        community_id: community.id,
        post_id: postId,
        pinned_by_id: moderator.id,
      }),
    ])
    expect(await getPinnedPosts(community.id, moderator)).toEqual([
      expect.objectContaining({ post_id: postId }),
    ])
    const cleared = await callStructuredMcpTool(
      moderator,
      'update_community_moderation',
      optionArgs('set_pinned_posts', { community: community.id, post_ids: [] }),
      scopes,
    )
    expect(cleared).toEqual({ pinned_posts: [] })
    expect(await getPinnedPosts(community.id, moderator)).toEqual([])
  })
})
