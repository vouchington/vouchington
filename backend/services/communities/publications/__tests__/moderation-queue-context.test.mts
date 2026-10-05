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

type FlaggedPostModerationQueueContextInput = {
  author: PrivateUser
  reporter: PrivateUser
  viewerTier: 'moderator' | 'member'
  communityName: string
  communitySlug: string
  postSlug: string
  postTitle: string
  agentSlug: string
  topicName: string
  topicSlug: string
}

async function seedFlaggedPostModerationQueueContext(
  input: FlaggedPostModerationQueueContextInput,
) {
  const community = await insertTestCommunity({
    createdById: input.author.id,
    name: input.communityName,
    slug: input.communitySlug,
  })
  const postId = await insertTestPost({
    createdById: input.author.id,
    slug: input.postSlug,
    title: input.postTitle,
    markdown: 'body',
    communityId: community.id,
  })
  await setPostOpenAIModerationResults(postId, {
    flagged: true,
    categories: { violence: true },
  })
  const agent = await createTestAgent({ agentType: 'moderator', slug: input.agentSlug })
  const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
  await insertTestAgentModeration({
    postId,
    promptId,
    agentId: agent.id,
    flagged: true,
    results: { flagged: true, categories: ['violence'] },
  })
  const topicId = await insertTestTopic({
    name: input.topicName,
    slug: input.topicSlug,
    createdById: input.author.id,
  })
  await insertScoredPostTopicCategoryRelation(postId, topicId, agent.system_user_id)
  await insertTestModerationReport({
    reporterUserId: input.reporter.id,
    entityType: 'post',
    entityId: postId,
    reason: 'harassment',
  })

  const result = await searchCommunityModerationQueue(community.id, {
    limit: 50,
    viewerTier: input.viewerTier,
  })
  const entry = result.entries.find(candidate => candidate.entity_id === postId)
  expect(entry).toBeDefined()
  expect(entry!.post_moderation_context).toBeTruthy()
  return entry!.post_moderation_context!
}

describe('searchCommunityModerationQueue — post_moderation_context', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('moderator tier: full context with categories', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const agentSlug = `pmc-q-mod-${suffix}`
    const topicSlug = `pmc-q-topic-${suffix}`
    const ctx = await seedFlaggedPostModerationQueueContext({
      author,
      reporter,
      viewerTier: 'moderator',
      communityName: `PMC Queue Mod ${suffix}`,
      communitySlug: `pmc-queue-mod-${suffix}`,
      postSlug: `pmc-queue-mod-post-${suffix}`,
      postTitle: `PMC Queue Mod Post ${suffix}`,
      agentSlug,
      topicName: `PMC Q Topic ${suffix}`,
      topicSlug,
    })
    expect(ctx.platform_moderation!.is_flagged).toBe(true)
    expect(Array.isArray(ctx.platform_moderation!.categories)).toBe(true)
    expect(ctx.platform_moderation!.categories).toContain('violence')
    const agentMod = ctx.agent_moderations.find(moderation => moderation.slug === agentSlug)
    expect(agentMod!.categories).toContain('violence')
    expect(ctx.agent_added_tags).toContain(topicSlug)
  })

  it('member tier: coarse context, no categories', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const agentSlug = `pmc-q-member-mod-${suffix}`
    const topicSlug = `pmc-q-member-topic-${suffix}`
    const ctx = await seedFlaggedPostModerationQueueContext({
      author,
      reporter,
      viewerTier: 'member',
      communityName: `PMC Queue Member ${suffix}`,
      communitySlug: `pmc-queue-member-${suffix}`,
      postSlug: `pmc-queue-member-post-${suffix}`,
      postTitle: `PMC Queue Member Post ${suffix}`,
      agentSlug,
      topicName: `PMC Q Member Topic ${suffix}`,
      topicSlug,
    })
    expect(ctx.platform_moderation!.is_flagged).toBe(true)
    // Public tier: no categories key
    expect('categories' in ctx.platform_moderation!).toBe(false)
    const agentMod = ctx.agent_moderations.find(moderation => moderation.slug === agentSlug)
    expect(agentMod!.is_flagged).toBe(true)
    expect('categories' in agentMod!).toBe(false)
    // agent_added_tags still present at public tier
    expect(ctx.agent_added_tags).toContain(topicSlug)
  })
})
