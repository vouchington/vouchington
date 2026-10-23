import { it, expect, beforeAll, describe } from 'vitest'
import { searchPostModerationsByPostIds } from '../search-post-moderations.mts'
import { createPost } from '@services/posts'
import {
  createTestAgent,
  createTestUser,
  insertTestAgentModeration,
  insertTestAgentPrompt,
  WEB_PROVENANCE,
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
    const moderator = await createTestAgent({ slug: moderatorSlug, activated: true })
    agentId = moderator.id

    promptId = await insertTestAgentPrompt({ agentId })
  })
  it('searchPostModerationsByPostIds - returns empty array for empty input', async () => {
    const results = await searchPostModerationsByPostIds([])
    expect(results).toEqual([])
  })

  it('searchPostModerationsByPostIds - returns empty array when no moderations exist', async () => {
    const random = randomSuffix()
    const post = await createPost(user, WEB_PROVENANCE, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    const results = await searchPostModerationsByPostIds([post.id])
    expect(results).toEqual([])
  })

  it('searchPostModerationsByPostIds - returns moderation with correct fields', async () => {
    const random = randomSuffix()
    const post = await createPost(user, WEB_PROVENANCE, {
      title: `Test Post ${random}`,
      markdown: `Content ${random}`,
      post_type: 'discussion',
    })
    await insertTestAgentModeration({
      postId: post.id,
      promptId,
      agentId,
      flagged: true,
      results: { flagged: true, confidence_score: 0.87, confidence_threshold: 0.8 },
    })

    const results = await searchPostModerationsByPostIds([post.id])
    expect(results).toHaveLength(1)
    expect(results[0].post_id).toBe(post.id)
    expect(results[0].agent_id).toBe(agentId)
    expect(results[0].prompt_id).toBe(promptId)
    expect(results[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(results[0].is_flagged).toBe(true)
    expect(results[0].results).toEqual({
      flagged: true,
      confidence_score: 0.87,
      confidence_threshold: 0.8,
    })
    expect(results[0].moderator_slug).toBe(moderatorSlug)
    expect(typeof results[0].input_sha256).toBe('string')
    expect(results[0].input_sha256).toHaveLength(64) // 32 bytes as hex
  })

  it('searchPostModerationsByPostIds - returns moderations for multiple posts', async () => {
    const random = randomSuffix()
    const post1 = await createPost(user, WEB_PROVENANCE, {
      title: `Post 1 ${random}`,
      markdown: `Content 1 ${random}`,
      post_type: 'discussion',
    })
    const post2 = await createPost(user, WEB_PROVENANCE, {
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
    const post = await createPost(user, WEB_PROVENANCE, {
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
})
