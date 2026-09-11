import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  createTestAgent,
  insertTestAgentPrompt,
  insertTestAgentModeration,
  insertTestAgentModerationFalseyResults,
  insertTestTopic,
  insertScoredPostTopicCategoryRelation,
  mergeTopicForTest,
  setPostOpenAIModerationResults,
  setPostOpenAIModerationFlaggedOnly,
  setPostOpenAIModerationResultsNoCategoryKey,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { getPostModerationContextBatch } from '../post-moderation-context.mts'
import crypto from 'node:crypto'

describe('getPostModerationContextBatch', () => {
  let author: PrivateUser

  beforeAll(async () => {
    author = await createTestUser()
  })

  it('returns an empty map for empty input', async () => {
    const result = await getPostModerationContextBatch([])
    expect(result.size).toBe(0)
  })

  it('returns a context entry for each requested post id', async () => {
    const postId1 = await insertTestPost({
      createdById: author.id,
      slug: `mod-ctx-batch-1-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Ctx Batch Post 1 ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body 1',
    })
    const postId2 = await insertTestPost({
      createdById: author.id,
      slug: `mod-ctx-batch-2-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Ctx Batch Post 2 ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body 2',
    })
    const result = await getPostModerationContextBatch([postId1, postId2])
    expect(result.size).toBeGreaterThanOrEqual(2)
    expect(result.has(postId1)).toBe(true)
    expect(result.has(postId2)).toBe(true)
  })

  it('returns null openai_moderation when no moderation data exists', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-ctx-no-mod-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Ctx No Moderation Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const result = await getPostModerationContextBatch([postId])
    const ctx = result.get(postId)
    expect(ctx).toBeDefined()
    expect(ctx!.openai_moderation).toBeNull()
    expect(ctx!.agent_moderations).toEqual([])
    expect(ctx!.agent_added_tags).toEqual([])
  })

  it('includes an entry for a non-existent post id with null moderation', async () => {
    const nonExistentId = crypto.randomUUID()
    const result = await getPostModerationContextBatch([nonExistentId])
    const ctx = result.get(nonExistentId)
    expect(result.has(nonExistentId)).toBe(true)
    expect(ctx!.openai_moderation).toBeNull()
    expect(ctx!.agent_moderations).toEqual([])
    expect(ctx!.agent_added_tags).toEqual([])
  })

  it('returns staff-tier context for a fresh post (no moderation row)', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-ctx-staff-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Ctx Staff Tier Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const result = await getPostModerationContextBatch([postId], 'staff')
    const ctx = result.get(postId)
    expect(ctx).toBeDefined()
    expect(ctx!.openai_moderation).toBeNull()
    expect(Array.isArray(ctx!.agent_added_tags)).toBe(true)
  })

  it('returns public-tier context for a fresh post (no moderation row)', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `mod-ctx-public-${crypto.randomUUID().slice(0, 8)}`,
      title: `Mod Ctx Public Tier Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    const result = await getPostModerationContextBatch([postId], 'public')
    const ctx = result.get(postId)
    expect(ctx).toBeDefined()
    expect(ctx!.openai_moderation).toBeNull()
    expect(Array.isArray(ctx!.agent_added_tags)).toBe(true)
  })

  describe('with fully seeded moderation data', () => {
    let postId: string
    let agentSlug: string
    let topicSlug: string

    beforeAll(async () => {
      const suffix = crypto.randomUUID().slice(0, 8)
      agentSlug = `test-mod-${suffix}`
      topicSlug = `mod-topic-${suffix}`
      postId = await insertTestPost({
        createdById: author.id,
        slug: `mod-ctx-full-${suffix}`,
        title: `Mod Ctx Full Post ${suffix}`,
        markdown: 'body with moderation data',
      })
      await setPostOpenAIModerationResults(postId, {
        flagged: true,
        categories: { violence: true, harassment: false, hate: true },
      })
      const agent = await createTestAgent({ agentType: 'moderator', slug: agentSlug })
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        flagged: true,
        results: {
          flagged: true,
          reason: 'Detected harmful content',
          categories: ['violence', 'hate'],
        },
      })
      const [topicId, mergedTopicId, mergeDestinationTopicId] = await Promise.all([
        insertTestTopic({ name: `Mod Topic ${suffix}`, slug: topicSlug, createdById: author.id }),
        insertTestTopic({
          name: `Merged Mod Topic ${suffix}`,
          slug: `merged-mod-topic-${suffix}`,
          createdById: author.id,
        }),
        insertTestTopic({
          name: `Merge Destination Topic ${suffix}`,
          slug: `merge-destination-topic-${suffix}`,
          createdById: author.id,
        }),
      ])
      await Promise.all([
        insertScoredPostTopicCategoryRelation(postId, topicId, agent.system_user_id),
        insertScoredPostTopicCategoryRelation(postId, mergedTopicId, agent.system_user_id),
      ])
      await mergeTopicForTest(mergedTopicId, mergeDestinationTopicId, author.id)
    })

    it('staff tier: openai_moderation has flagged=true and populated categories', async () => {
      const result = await getPostModerationContextBatch([postId], 'staff')
      const oai = result.get(postId)!.openai_moderation
      expect(oai).not.toBeNull()
      expect(oai!.flagged).toBe(true)
      expect(Array.isArray(oai!.categories)).toBe(true)
      expect(oai!.categories).toContain('violence')
      expect(oai!.categories).toContain('hate')
      expect(oai!.categories).not.toContain('harassment')
    })

    it('staff tier: agent_moderations has slug, flagged, and categories', async () => {
      const result = await getPostModerationContextBatch([postId], 'staff')
      const agentMods = result.get(postId)!.agent_moderations
      const mod = agentMods.find(m => m.slug === agentSlug)
      expect(mod).toBeDefined()
      expect(mod!.flagged).toBe(true)
      expect(Array.isArray(mod!.categories)).toBe(true)
      expect(mod!.categories).toContain('violence')
      expect(mod!.categories).toContain('hate')
    })

    it('staff tier: agent_added_tags retains active tags and excludes merged tags', async () => {
      const result = await getPostModerationContextBatch([postId], 'staff')
      expect(result.get(postId)!.agent_added_tags).toEqual([topicSlug])
    })

    it('public tier: openai_moderation has flagged but no categories key', async () => {
      const result = await getPostModerationContextBatch([postId], 'public')
      const oai = result.get(postId)!.openai_moderation
      expect(oai).not.toBeNull()
      expect(oai!.flagged).toBe(true)
      expect('categories' in oai!).toBe(false)
    })

    it('public tier: agent_moderations has no categories key', async () => {
      const result = await getPostModerationContextBatch([postId], 'public')
      const mod = result.get(postId)!.agent_moderations.find(m => m.slug === agentSlug)
      expect(mod).toBeDefined()
      expect(mod!.flagged).toBe(true)
      expect('categories' in mod!).toBe(false)
    })

    it('public tier: agent_added_tags still present', async () => {
      const result = await getPostModerationContextBatch([postId], 'public')
      expect(result.get(postId)!.agent_added_tags).toContain(topicSlug)
    })
  })

  describe('extractor edge cases', () => {
    it('openai: empty categories when results is NULL', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `mod-ctx-null-res-${crypto.randomUUID().slice(0, 8)}`,
        title: `Mod Ctx Null Results ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await setPostOpenAIModerationFlaggedOnly(postId, true)
      const ctx = (await getPostModerationContextBatch([postId], 'staff')).get(postId)!
      expect(ctx.openai_moderation!.flagged).toBe(true)
      expect(ctx.openai_moderation!.categories).toEqual([])
    })

    it('openai: empty categories when results has no categories key', async () => {
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `mod-ctx-no-cat-${crypto.randomUUID().slice(0, 8)}`,
        title: `Mod Ctx No Categories ${crypto.randomUUID().slice(0, 8)}`,
        markdown: 'body',
      })
      await setPostOpenAIModerationResultsNoCategoryKey(postId, false)
      const ctx = (await getPostModerationContextBatch([postId], 'staff')).get(postId)!
      expect(ctx.openai_moderation!.flagged).toBe(false)
      expect(ctx.openai_moderation!.categories).toEqual([])
    })

    it('agent: empty categories when results has no categories key', async () => {
      const suffix = crypto.randomUUID().slice(0, 8)
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `mod-ctx-agent-nocat-${suffix}`,
        title: `Mod Ctx Agent No Categories ${suffix}`,
        markdown: 'body',
      })
      const agent = await createTestAgent({ agentType: 'moderator', slug: `no-cat-mod-${suffix}` })
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      await insertTestAgentModeration({
        postId,
        promptId,
        agentId: agent.id,
        flagged: false,
        results: { flagged: false, reason: 'No issue' },
      })
      const mod = (await getPostModerationContextBatch([postId], 'staff'))
        .get(postId)!
        .agent_moderations.find(m => m.slug === `no-cat-mod-${suffix}`)
      expect(mod).toBeDefined()
      expect(mod!.categories).toEqual([])
    })

    it('agent: empty categories when results is a JSONB falsy value', async () => {
      const suffix = crypto.randomUUID().slice(0, 8)
      const postId = await insertTestPost({
        createdById: author.id,
        slug: `mod-ctx-agent-falsy-${suffix}`,
        title: `Mod Ctx Agent Falsy Results ${suffix}`,
        markdown: 'body',
      })
      const agent = await createTestAgent({ agentType: 'moderator', slug: `falsy-mod-${suffix}` })
      const promptId = await insertTestAgentPrompt({ agentId: agent.id, activated: true })
      await insertTestAgentModerationFalseyResults({ postId, promptId, agentId: agent.id })
      const mod = (await getPostModerationContextBatch([postId], 'staff'))
        .get(postId)!
        .agent_moderations.find(m => m.slug === `falsy-mod-${suffix}`)
      expect(mod).toBeDefined()
      expect(mod!.categories).toEqual([])
    })
  })
})
