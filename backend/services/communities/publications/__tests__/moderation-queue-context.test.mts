import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  insertTestCommunity,
  createTestAgent,
  insertTestAgentPrompt,
  insertTestAgentModeration,
  insertTestTopic,
  insertScoredPostTopicCategoryRelation,
  setPostOpenAIModerationResults,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { searchCommunityModerationQueue } from '../moderation-queue.mts'
import crypto from 'node:crypto'

describe('searchCommunityModerationQueue — post_moderation_context', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('moderator tier: full context with categories', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `PMC Queue Mod ${suffix}`,
      slug: `pmc-queue-mod-${suffix}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `pmc-queue-mod-post-${suffix}`,
      title: `PMC Queue Mod Post ${suffix}`,
      markdown: 'body',
      communityId: community.id,
    })
    await setPostOpenAIModerationResults(postId, {
      flagged: true,
      categories: { violence: true },
    })
    const agentSlug = `pmc-q-mod-${suffix}`
    const topicSlug = `pmc-q-topic-${suffix}`
    const agent = await createTestAgent({ agentType: 'moderator', slug: agentSlug })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: true,
      results: { flagged: true, reason: 'violence', categories: ['violence'] },
    })
    const topicId = await insertTestTopic({
      name: `PMC Q Topic ${suffix}`,
      slug: topicSlug,
      createdById: author.id,
    })
    await insertScoredPostTopicCategoryRelation(postId, topicId, agent.system_user_id)
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
    })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      viewerTier: 'moderator',
    })
    const entry = result.entries.find(e => e.entity_id === postId)
    expect(entry).toBeDefined()
    const ctx = entry!.post_moderation_context!
    expect(ctx.openai_moderation!.flagged).toBe(true)
    expect(Array.isArray(ctx.openai_moderation!.categories)).toBe(true)
    expect(ctx.openai_moderation!.categories).toContain('violence')
    const agentMod = ctx.agent_moderations.find(m => m.slug === agentSlug)
    expect(agentMod!.categories).toContain('violence')
    expect(ctx.agent_added_tags).toContain(topicSlug)
  })

  it('member tier: coarse context, no categories', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const community = await insertTestCommunity({
      createdById: author.id,
      name: `PMC Queue Member ${suffix}`,
      slug: `pmc-queue-member-${suffix}`,
    })
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `pmc-queue-member-post-${suffix}`,
      title: `PMC Queue Member Post ${suffix}`,
      markdown: 'body',
      communityId: community.id,
    })
    await setPostOpenAIModerationResults(postId, {
      flagged: true,
      categories: { violence: true },
    })
    const agentSlug = `pmc-q-member-mod-${suffix}`
    const topicSlug = `pmc-q-member-topic-${suffix}`
    const agent = await createTestAgent({ agentType: 'moderator', slug: agentSlug })
    const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
    await insertTestAgentModeration({
      postId,
      promptId,
      agentId: agent.id,
      flagged: true,
      results: { flagged: true, reason: 'violence', categories: ['violence'] },
    })
    const topicId = await insertTestTopic({
      name: `PMC Q Member Topic ${suffix}`,
      slug: topicSlug,
      createdById: author.id,
    })
    await insertScoredPostTopicCategoryRelation(postId, topicId, agent.system_user_id)
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
    })

    const result = await searchCommunityModerationQueue(community.id, {
      limit: 50,
      viewerTier: 'member',
    })
    const entry = result.entries.find(e => e.entity_id === postId)
    expect(entry).toBeDefined()
    const ctx = entry!.post_moderation_context!
    expect(ctx.openai_moderation!.flagged).toBe(true)
    // Public tier: no categories key
    expect('categories' in ctx.openai_moderation!).toBe(false)
    const agentMod = ctx.agent_moderations.find(m => m.slug === agentSlug)
    expect(agentMod!.flagged).toBe(true)
    expect('categories' in agentMod!).toBe(false)
    // agent_added_tags still present at public tier
    expect(ctx.agent_added_tags).toContain(topicSlug)
  })
})
