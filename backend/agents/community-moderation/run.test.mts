import { describe, expect, it, beforeAll } from 'vitest'
import { runCommunityPromptOnPost } from '@agents/community-moderation'
import { unpublishPostAsAgent } from '@services/communities/publications/moderate'
import { getPostByAny } from '@services/posts/get'
import {
  createTestUser,
  createSystemUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityAgentPrompt,
  insertTestCommunityPostReview,
  insertTestPost,
  getCommunityPostReviewStatus,
  getModeratorActionRowsForTest,
  updateTestCommunityPostReviewState,
} from '@voucha/test-helpers'
import { MODERATION_SYSTEM_USERNAME } from '@services/users/constants'
import type { Post } from '@services/posts/types'
import type { PrivateUser } from '@services/users/types'
import { suppressedError } from '@voucha/test-helpers/suppressed-error'

describe('runCommunityPromptOnPost on_flag_action', () => {
  let owner: PrivateUser
  let moderationSystemUserId: string

  beforeAll(async () => {
    const [createdOwner, moderationSystemUser] = await Promise.all([
      createTestUser(),
      createSystemUser(MODERATION_SYSTEM_USERNAME),
    ])
    owner = createdOwner!
    moderationSystemUserId = moderationSystemUser.id
  })

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  it('on_flag_action=none: flagged → recorded only, review stays', async () => {
    const r = randomSuffix()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'none',
    })

    const postId = await insertTestPost({
      title: `Community none test ${r}`,
      slug: `comm-none-test-${r}`,
      markdown: 'Test post content',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })

    const post = (await getPostByAny(postId)) as Post

    const result = await runCommunityPromptOnPost(post, community.id, prompt.id, {
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Test flag' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(true)
    expect(result.unpublished).toBe(false)
    expect(result.skipped).toBe(false)

    const review = await getCommunityPostReviewStatus(community.id, postId)
    expect(review?.unpublished_at).toBeNull()
  })

  it('on_flag_action=unpublish: flagged → review unpublished', async () => {
    const r = randomSuffix()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })

    const postId = await insertTestPost({
      title: `Community unpublish test ${r}`,
      slug: `comm-unpublish-test-${r}`,
      markdown: 'Test post content',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })

    const post = (await getPostByAny(postId)) as Post

    const result = await runCommunityPromptOnPost(post, community.id, prompt.id, {
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Test flag' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(true)
    expect(result.unpublished).toBe(true)
    expect(result.skipped).toBe(false)

    const review = await getCommunityPostReviewStatus(community.id, postId)
    expect(review?.unpublished_at).not.toBeNull()
    expect(review?.unpublished_by_id).toBe(moderationSystemUserId)
    const actions = await getModeratorActionRowsForTest({
      actorId: moderationSystemUserId,
      communityId: community.id,
      postId,
    })
    expect(actions).toContainEqual(
      expect.objectContaining({
        action_type: 'remove',
        actor_id: moderationSystemUserId,
        community_id: community.id,
        post_id: postId,
      }),
    )

    await expect(unpublishPostAsAgent(community.id, postId)).resolves.toBe('already-removed')
  })

  it('agent unpublish ignores rejected publication reviews', async () => {
    const r = randomSuffix()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
    const postId = await insertTestPost({
      title: `Community rejected unpublish test ${r}`,
      slug: `comm-rejected-unpublish-test-${r}`,
      markdown: 'Test post content',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })
    await updateTestCommunityPostReviewState({
      communityId: community.id,
      postId,
      approvedAt: null,
      rejectedAt: new Date(),
    })

    await expect(unpublishPostAsAgent(community.id, postId)).resolves.toBe('not-applicable')
    const review = await getCommunityPostReviewStatus(community.id, postId)
    expect(review?.unpublished_at).toBeNull()
  })

  it('on_flag_action=unpublish: no publication → does not report unpublished', async () => {
    const r = randomSuffix()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })

    const postId = await insertTestPost({
      title: `Community unpublish missing review test ${r}`,
      slug: `comm-unpublish-missing-review-test-${r}`,
      markdown: 'Test post content',
      createdById: owner.id,
    })

    const post = (await getPostByAny(postId)) as Post

    const result = await runCommunityPromptOnPost(post, community.id, prompt.id, {
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Test flag' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(true)
    expect(result.unpublished).toBe(false)
    expect(result.skipped).toBe(false)

    const review = await getCommunityPostReviewStatus(community.id, postId)
    expect(review).toBeUndefined()
  })

  it('on_flag_action=unpublish: unpublish failure is returned without dropping moderation result', async () => {
    const r = randomSuffix()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })

    const postId = await insertTestPost({
      title: `Community unpublish failure test ${r}`,
      slug: `comm-unpublish-failure-test-${r}`,
      markdown: 'Test post content',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })

    const post = (await getPostByAny(postId)) as Post

    const result = await runCommunityPromptOnPost(post, community.id, prompt.id, {
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Test flag' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
      unpublishPost: () => Promise.reject(suppressedError('forced unpublish failure')),
    })

    expect(result).toMatchObject({
      flagged: true,
      reason: 'Test flag',
      skipped: false,
      unpublished: false,
      error: 'forced unpublish failure',
    })

    const review = await getCommunityPostReviewStatus(community.id, postId)
    expect(review?.unpublished_at).toBeNull()
  })

  it('not flagged → review stays regardless of on_flag_action', async () => {
    const r = randomSuffix()
    const community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })

    const prompt = await insertTestCommunityAgentPrompt({
      communityId: community.id,
      createdById: owner.id,
      slotAllocated: true,
      onFlagAction: 'unpublish',
    })

    const postId = await insertTestPost({
      title: `Community pass test ${r}`,
      slug: `comm-pass-test-${r}`,
      markdown: 'Test post content',
      createdById: owner.id,
    })
    await insertTestCommunityPostReview({ communityId: community.id, postId })

    const post = (await getPostByAny(postId)) as Post

    const result = await runCommunityPromptOnPost(post, community.id, prompt.id, {
      callModeration: () =>
        Promise.resolve({
          result: { flagged: false, reason: '' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(false)
    expect(result.unpublished).toBe(false)
    expect(result.skipped).toBe(false)

    const review = await getCommunityPostReviewStatus(community.id, postId)
    expect(review?.unpublished_at).toBeNull()
  })
})
