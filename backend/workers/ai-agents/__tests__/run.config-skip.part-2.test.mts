import { describe, expect, it } from 'vitest'

import {
  checkExistingModeration,
  getModeratorConfig,
  insertPostModerationAgent,
} from '@services/moderation'

import { runModeratorOnPost } from '@agents/moderation'

import { processModerationPrompt } from '../processors/process-moderation.mts'

import { createPost } from '@services/posts'

import { createPostModerationContent } from '@services/posts/content'

import { getPostByAny } from '@services/posts/get'

import { getPostElectionVote, upsertPostElectionVotes } from '@services/elections-votes/post'

import { searchPostModerationsByAgent } from '@services/moderation/search-post-moderations'

import {
  insertTestCommunity,
  insertTestCommunityMember,
  mockAiGeneratedModerationResults,
} from '@voucha/test-helpers'

import {
  ensureTopicExists,
  randomSuffix,
  setupModeratorAndPrompt,
  setupModeratorBySlugAndPrompt,
} from '../processors/run-config-skip.test-helpers.mts'

import type { Post } from '@services/posts/types'

describe('runModeratorOnPost config and skip behaviors', () => {
  it('runModeratorOnPost stores AI-generated confidence data, queues review, and tags ai-generated', async () => {
    await ensureTopicExists('ai-generated')
    const {
      moderator,
      prompt,
      user: testUser,
    } = await setupModeratorBySlugAndPrompt('ai-generated')
    const post = await createPost(testUser, {
      title: `AI generated post ${randomSuffix()}`,
      markdown: `AI generated content ${randomSuffix()}`,
      post_type: 'discussion',
    })

    const result = await runModeratorOnPost(post as Post, moderator.slug, {
      promptId: prompt.id,
      detectAiGenerated: () => Promise.resolve(mockAiGeneratedModerationResults),
    })

    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.tagged_topics).toEqual(['ai-generated'])

    const vote = await getPostElectionVote(moderator.system_user_id, post.id)
    expect(vote?.choice).not.toBe('dislike')

    const moderations = await searchPostModerationsByAgent(post.id, moderator.id)
    expect(moderations.results[0]?.results).toMatchObject(mockAiGeneratedModerationResults)
  })

  it('processModerationPrompt injects the AI-generated detector for worker jobs', async () => {
    await ensureTopicExists('ai-generated')
    const { moderator, user: testUser } = await setupModeratorBySlugAndPrompt('ai-generated')
    const community = await insertTestCommunity({
      createdById: testUser.id,
      slug: `ai-generated-worker-${randomSuffix()}`,
    })
    await insertTestCommunityMember({
      communityId: community.id,
      userId: testUser.id,
      role: 'owner',
    })
    // ai-generated is a baseline (always-on) moderator — no enableCommunityAutoTaggerAgent needed
    const post = await createPost(testUser, {
      title: `AI generated worker prompt ${randomSuffix()}`,
      markdown: `AI generated worker prompt content ${randomSuffix()}`,
      community_id: community.id,
      post_type: 'discussion',
    })

    await expect(
      processModerationPrompt({
        data: { id: post.id, moderatorSlug: moderator.slug, source: 'baseline' },
      } as Parameters<typeof processModerationPrompt>[0]),
    ).resolves.toMatchObject({
      moderator_slug: moderator.slug,
      skipped: false,
      success: true,
    })
  })

  it('runModeratorOnPost reports the AI-generated slug when detector injection is missing', async () => {
    const {
      moderator,
      prompt,
      user: testUser,
    } = await setupModeratorBySlugAndPrompt('ai-generated')
    const post = await createPost(testUser, {
      title: `AI generated detector missing ${randomSuffix()}`,
      markdown: `AI generated detector missing content ${randomSuffix()}`,
      post_type: 'discussion',
    })

    await expect(
      runModeratorOnPost(post as Post, moderator.slug, { promptId: prompt.id }),
    ).rejects.toThrow("Cannot run moderator 'ai-generated' without options.detectAiGenerated")
  })

  it('runModeratorOnPost tags political when politics-averse flags content', async () => {
    await ensureTopicExists('political')
    const {
      moderator,
      prompt,
      user: testUser,
    } = await setupModeratorBySlugAndPrompt('politics-averse')
    const post = await createPost(testUser, {
      title: `Political post ${randomSuffix()}`,
      markdown: `Political content ${randomSuffix()}`,
      post_type: 'discussion',
    })

    const result = await runModeratorOnPost(post as Post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Unsupported political claim presented as fact.' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })

    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.tagged_topics).toEqual(['political'])

    const vote = await getPostElectionVote(moderator.system_user_id, post.id)
    expect(vote?.choice).not.toBe('dislike')

    const refreshedPost = await getPostByAny(post.id)
    expect(refreshedPost?.clearance_status).toBe('in_review')
  })

  it('runModeratorOnPost marketplace tagging keeps only valid categories', async () => {
    await ensureTopicExists('buying')
    await ensureTopicExists('for-hire')
    await ensureTopicExists('selling')
    const { moderator, prompt, user: testUser } = await setupModeratorBySlugAndPrompt('marketplace')
    const post = await createPost(testUser, {
      title: `Marketplace post ${randomSuffix()}`,
      markdown: `Marketplace content ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const result = await runModeratorOnPost(post as Post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: {
            flagged: true,
            reason: 'Marketplace content.',
            categories: ['  BUYING ', 'for-hire', 'not-real', 'SELLING', 'invalid-category'],
          },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })
    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.tagged_topics).toEqual(['buying', 'for-hire', 'selling'])
  })

  it('runModeratorOnPost marketplace tagging ignores legacy reason categories', async () => {
    const { moderator, prompt, user: testUser } = await setupModeratorBySlugAndPrompt('marketplace')
    const post = await createPost(testUser, {
      title: `Marketplace legacy reason post ${randomSuffix()}`,
      markdown: `Marketplace legacy reason content ${randomSuffix()}`,
      post_type: 'discussion',
    })
    const result = await runModeratorOnPost(post as Post, moderator.slug, {
      promptId: prompt.id,
      callModeration: () =>
        Promise.resolve({
          result: { flagged: true, reason: 'Categories: [buying, selling]' },
          usage: null,
          model: 'test',
          service_tier: 'test',
        }),
    })
    expect(result.flagged).toBe(true)
    expect(result.skipped).toBe(false)
    expect(result.tagged_topics).toEqual([])
  })
  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof getModeratorConfig)
  void (0 as unknown as typeof checkExistingModeration)
  void (0 as unknown as typeof insertPostModerationAgent)
  void (0 as unknown as typeof createPostModerationContent)
  void (0 as unknown as typeof upsertPostElectionVotes)
  void (0 as unknown as typeof setupModeratorAndPrompt)
})
