import { it, expect, beforeAll, describe } from 'vitest'
import {
  searchPostModerationsByPostIds,
  searchPostModerationsByAgent,
} from '../search-post-moderations.mts'
import { createPostLLMModerator, updatePostLLMModerator } from '../moderators.mts'
import { createPost } from '@services/posts'
import {
  createTestUser,
  createSystemUser,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  mockAiGeneratedModerationResults,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('search-post-moderations', () => {
  let user: PrivateUser
  let agentId: string
  let promptId: string
  let moderatorSlug: string

  function randomSuffix(): string {
    return Math.random().toString(36).slice(2, 10)
  }

  beforeAll(async () => {
    user = await createTestUser()

    const random = randomSuffix()
    moderatorSlug = `test-mod-${random}`
    const systemUser = await createSystemUser(moderatorSlug)
    const moderator = await createPostLLMModerator(user, systemUser, moderatorSlug)
    await updatePostLLMModerator(user, moderator.id, { active: true })
    agentId = moderator.id

    promptId = await insertTestAgentPrompt({ agentId })
  })
  it('searchPostModerationsByPostIds - returns empty array for empty input', async () => {
    const results = await searchPostModerationsByPostIds([])
    expect(results).toEqual([])
  })

  it('searchPostModerationsByPostIds - returns empty array when no moderations exist', async () => {
    const random = randomSuffix()
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    const results = await searchPostModerationsByPostIds([post.id])
    expect(results).toEqual([])
  })

  it('searchPostModerationsByPostIds - returns moderation with correct fields', async () => {
    const random = randomSuffix()
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    await insertTestAgentModeration({
      postId: post.id,
      promptId,
      agentId,
      flagged: true,
      results: { flagged: true, reason: `Flagged ${random}` },
    })

    const results = await searchPostModerationsByPostIds([post.id])
    expect(results).toHaveLength(1)
    expect(results[0].post_id).toBe(post.id)
    expect(results[0].agent_id).toBe(agentId)
    expect(results[0].prompt_id).toBe(promptId)
    expect(results[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(results[0].flagged).toBe(true)
    expect(results[0].results.reason).toBe(`Flagged ${random}`)
    expect(results[0].moderator_slug).toBe(moderatorSlug)
    expect(typeof results[0].input_sha256).toBe('string')
    expect(results[0].input_sha256).toHaveLength(64) // 32 bytes as hex
  })

  it('searchPostModerationsByPostIds - returns moderations for multiple posts', async () => {
    const random = randomSuffix()
    const post1 = await createPost(user, {
      title: `Post 1 ${random}`,
      markdown: `Content 1 ${random}`,
      post_type: 'discussion',
    })
    const post2 = await createPost(user, {
      title: `Post 2 ${random}`,
      markdown: `Content 2 ${random}`,
      post_type: 'discussion',
    })
    await insertTestAgentModeration({ postId: post1.id, promptId, agentId, flagged: false })
    await insertTestAgentModeration({ postId: post2.id, promptId, agentId, flagged: true })

    const results = await searchPostModerationsByPostIds([post1.id, post2.id])
    const postIds = results.map(r => r.post_id)
    expect(postIds).toContain(post1.id)
    expect(postIds).toContain(post2.id)
  })

  it('searchPostModerationsByPostIds - caps results at 10 per post', async () => {
    const random = randomSuffix()
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    // Insert 12 moderations for the same post
    for (let i = 0; i < 12; i++) {
      await insertTestAgentModeration({ postId: post.id, promptId, agentId })
    }

    const results = await searchPostModerationsByPostIds([post.id])
    expect(results.length).toBeLessThanOrEqual(10)
  })

  it('searchPostModerationsByAgent - returns moderations for post + agent', async () => {
    const random = randomSuffix()
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    await insertTestAgentModeration({
      postId: post.id,
      promptId,
      agentId,
      flagged: false,
      results: { flagged: false, reason: `OK ${random}` },
    })

    const { results } = await searchPostModerationsByAgent(post.id, agentId)
    expect(results.length).toBeGreaterThanOrEqual(1)
    const match = results.find(r => r.results.reason === `OK ${random}`)
    expect(match).toBeDefined()
    expect(match?.post_id).toBe(post.id)
    expect(match?.agent_id).toBe(agentId)
    expect(match?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(match?.moderator_slug).toBe(moderatorSlug)
    expect(typeof match?.input_sha256).toBe('string')
  })

  it('searchPostModerationsByAgent - preserves stored confidence metadata', async () => {
    const random = randomSuffix()
    const post = await createPost(user, {
      title: `Confidence Post ${random}`,
      markdown: `Confidence Content ${random}`,
      post_type: 'discussion',
    })
    await insertTestAgentModeration({
      postId: post.id,
      promptId,
      agentId,
      flagged: true,
      results: mockAiGeneratedModerationResults,
    })

    const { results } = await searchPostModerationsByAgent(post.id, agentId)
    expect(results[0]?.results).toMatchObject(mockAiGeneratedModerationResults)
  })

  it('searchPostModerationsByAgent - respects limit option', async () => {
    const random = randomSuffix()
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    for (let i = 0; i < 5; i++) {
      await insertTestAgentModeration({ postId: post.id, promptId, agentId })
    }

    const { results } = await searchPostModerationsByAgent(post.id, agentId, { limit: 3 })
    expect(results.length).toBeLessThanOrEqual(3)
  })

  it('searchPostModerationsByAgent - returns empty array when no moderations for agent', async () => {
    const random = randomSuffix()
    const post = await createPost(user, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    const { results, hasNextPage } = await searchPostModerationsByAgent(post.id, agentId)
    expect(results).toEqual([])
    expect(hasNextPage).toBe(false)
  })
})
