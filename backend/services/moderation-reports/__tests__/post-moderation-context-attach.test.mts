import { describe, it, expect, beforeAll } from 'vitest'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  createTestAgent,
  insertTestAgentPrompt,
  insertTestAgentModeration,
  insertTestTopic,
  insertScoredPostTopicCategoryRelation,
  setPostOpenAIModerationResults,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { listModerationReports } from '../get.mts'
import { listRedactedModerationReports } from '../redaction.mts'
import {
  attachPostModerationContext,
  toPublicPostModerationContext,
} from '../post-moderation-context-attach.mts'
import crypto from 'node:crypto'

describe('post_moderation_context — listModerationReports (staff tier)', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('attaches null post_moderation_context for non-post entity types (user)', async () => {
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: author.id,
      reason: 'spam',
      createdAt: new Date(Date.UTC(2600, 5, 1)),
    })

    const { reports } = await listModerationReports({
      limit: 1000,
      sort: 'created_at_desc',
    })
    const found = reports.find(r => r.id === reportId)
    expect(found).toBeDefined()
    expect(found!.post_moderation_context).toBeNull()
  })

  it('attaches post_moderation_context for a post with no moderation data', async () => {
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `pmc-staff-empty-${crypto.randomUUID().slice(0, 8)}`,
      title: `PMC Staff Empty Post ${crypto.randomUUID().slice(0, 8)}`,
      markdown: 'body',
    })
    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'spam',
      createdAt: new Date(Date.UTC(2600, 5, 2)),
    })

    const { reports } = await listModerationReports({
      limit: 1000,
      sort: 'created_at_desc',
    })
    const found = reports.find(r => r.entity_id === postId)
    expect(found).toBeDefined()
    expect(found!.post_moderation_context).not.toBeNull()
    expect(found!.post_moderation_context!.openai_moderation).toBeNull()
    expect(found!.post_moderation_context!.agent_moderations).toEqual([])
    expect(found!.post_moderation_context!.agent_added_tags).toEqual([])
  })

  it('includes agent_added_tags and full openai categories for staff', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `pmc-staff-full-${suffix}`,
      title: `PMC Staff Full Post ${suffix}`,
      markdown: 'body',
    })
    await setPostOpenAIModerationResults(postId, {
      flagged: true,
      categories: { violence: true, harassment: false },
    })
    const agentSlug = `pmc-mod-${suffix}`
    const topicSlug = `pmc-topic-${suffix}`
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
      name: `PMC Topic ${suffix}`,
      slug: topicSlug,
      createdById: author.id,
    })
    await insertScoredPostTopicCategoryRelation(postId, topicId, agent.system_user_id)

    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
      createdAt: new Date(Date.UTC(2600, 5, 3)),
    })

    const { reports } = await listModerationReports({
      limit: 1000,
      sort: 'created_at_desc',
    })
    const found = reports.find(r => r.entity_id === postId)
    expect(found).toBeDefined()
    const ctx = found!.post_moderation_context!
    expect(ctx.openai_moderation).not.toBeNull()
    expect(ctx.openai_moderation!.flagged).toBe(true)
    // Staff tier: full categories present
    expect(Array.isArray(ctx.openai_moderation!.categories)).toBe(true)
    expect(ctx.openai_moderation!.categories).toContain('violence')
    const agentMod = ctx.agent_moderations.find(m => m.slug === agentSlug)
    expect(agentMod).toBeDefined()
    expect(agentMod!.flagged).toBe(true)
    expect(Array.isArray(agentMod!.categories)).toBe(true)
    expect(agentMod!.categories).toContain('violence')
    expect(ctx.agent_added_tags).toContain(topicSlug)
  })
})

describe('post_moderation_context — listRedactedModerationReports (public tier)', () => {
  let author: PrivateUser
  let reporter: PrivateUser

  beforeAll(async () => {
    ;[author, reporter] = await Promise.all([createTestUser(), createTestUser()])
  })

  it('attaches null post_moderation_context for non-post entity types (user)', async () => {
    const reportId = await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'user',
      entityId: author.id,
      reason: 'spam',
      createdAt: new Date(Date.UTC(2600, 5, 4)),
    })

    const { reports } = await listRedactedModerationReports({
      limit: 1000,
      sort: 'created_at_desc',
    })
    const found = reports.find(r => r.id === reportId)
    expect(found).toBeDefined()
    expect(found!.post_moderation_context).toBeNull()
  })

  it('omits raw openai categories for non-staff (public tier)', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const postId = await insertTestPost({
      createdById: author.id,
      slug: `pmc-public-full-${suffix}`,
      title: `PMC Public Full Post ${suffix}`,
      markdown: 'body',
    })
    await setPostOpenAIModerationResults(postId, {
      flagged: true,
      categories: { violence: true },
    })
    const agentSlug = `pmc-pub-mod-${suffix}`
    const topicSlug = `pmc-pub-topic-${suffix}`
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
      name: `PMC Pub Topic ${suffix}`,
      slug: topicSlug,
      createdById: author.id,
    })
    await insertScoredPostTopicCategoryRelation(postId, topicId, agent.system_user_id)

    await insertTestModerationReport({
      reporterUserId: reporter.id,
      entityType: 'post',
      entityId: postId,
      reason: 'harassment',
      createdAt: new Date(Date.UTC(2600, 5, 5)),
    })

    const { reports } = await listRedactedModerationReports({
      limit: 1000,
      sort: 'created_at_desc',
    })
    const found = reports.find(r => r.entity_id === postId)
    expect(found).toBeDefined()
    const ctx = found!.post_moderation_context!
    expect(ctx.openai_moderation).not.toBeNull()
    expect(ctx.openai_moderation!.flagged).toBe(true)
    // Public tier: no categories key
    expect('categories' in ctx.openai_moderation!).toBe(false)
    const agentMod = ctx.agent_moderations.find(m => m.slug === agentSlug)
    expect(agentMod).toBeDefined()
    expect(agentMod!.flagged).toBe(true)
    // Public tier: no categories key on agent moderations
    expect('categories' in agentMod!).toBe(false)
    // agent_added_tags still present
    expect(ctx.agent_added_tags).toContain(topicSlug)
  })
})

describe('attachPostModerationContext — unit edge cases', () => {
  it('returns empty array for empty items list', async () => {
    const result = await attachPostModerationContext([], 'staff')
    expect(result).toEqual([])
  })

  it('deduplicates post IDs when two items share the same entity_id', async () => {
    // The dedup branch fires when two items have the same entity_id (e.g., two reports
    // for the same post appearing in the list). The seen-set skips the second occurrence.
    const sharedId = crypto.randomUUID()
    const items = [
      { entity_type: 'post' as const, entity_id: sharedId },
      { entity_type: 'post' as const, entity_id: sharedId },
    ]
    // Both items should receive the same context (null since postId doesn't exist in DB).
    const result = await attachPostModerationContext(items, 'staff')
    expect(result).toHaveLength(2)
    // Non-existent post gets context with null openai_moderation (getPostModerationContextBatch
    // provides a default entry for unknown IDs).
    expect(result[0]!.post_moderation_context).not.toBeNull()
    expect(result[1]!.post_moderation_context).not.toBeNull()
  })
})

describe('toPublicPostModerationContext', () => {
  it('drops category details but keeps coarse flags and tags', () => {
    const result = toPublicPostModerationContext({
      openai_moderation: { flagged: true, categories: ['hate'] },
      agent_moderations: [{ slug: 'spam', flagged: true, categories: ['promo'] }],
      agent_added_tags: ['ai-generated'],
    })
    expect(result!.openai_moderation).toEqual({ flagged: true })
    expect(result!.agent_moderations).toEqual([{ slug: 'spam', flagged: true }])
    expect(result!.agent_added_tags).toEqual(['ai-generated'])
  })

  it('handles null openai_moderation and a null context', () => {
    const result = toPublicPostModerationContext({
      openai_moderation: null,
      agent_moderations: [],
      agent_added_tags: [],
    })
    expect(result!.openai_moderation).toBeNull()
    expect(toPublicPostModerationContext(null)).toBeNull()
  })
})
