import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { insertEntityRelation } from '@voucha/test-helpers/entities/entity-relations'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { createTrendingPostData } from '@voucha/test-helpers/entities/trending-posts'
import { createTrendingTopicData } from '@voucha/test-helpers/entities/trending-topics'
import { updateEntityRelationElection } from '@voucha/test-helpers/entities/user-profile-fixture-mutations'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = {
  results: { id: string; trending_score: number }[]
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

const POST_TOPIC_RELATION = 'relation__post__category__topic'

// Each tool returns real service output through the real call path, which checks it against the
// tool's published output schema. The cursor is the one the tool itself returned, fed back as `after`.
describe('MCP output schema contract for trending reads — real DB', () => {
  let caller: PrivateUser & { membership_plan: null }
  let topicId: string
  let postIds: string[]

  beforeAll(async () => {
    const user = await createTestUser()
    caller = { ...user, membership_plan: null }

    // The posts share one topic, so a topic-scoped query sees only them in a shared database.
    topicId = (await createTestTopic({ user })).id
    postIds = []
    for (const votesScoreUp of [300, 200, 100]) {
      const { postId } = await createTrendingPostData({ votesScoreUp })
      await insertEntityRelation(POST_TOPIC_RELATION, postId, topicId)
      await updateEntityRelationElection(POST_TOPIC_RELATION, postId, topicId, {
        votes_score_up: 1,
        votes_count_up: 1,
      })
      postIds.push(postId)
    }
    // Three topics so the global topic ranking has at least three rows to page through.
    for (const postTagCount of [1, 2, 3]) {
      await createTrendingTopicData({ postTagCount, rssItemTagCount: 0, netVote: 1 })
    }
  })

  describe('get_trending_posts', () => {
    const callPosts = (args: Record<string, unknown>) =>
      callStructuredMcpTool(caller, 'get_trending_posts', { topic_id: topicId, ...args }, [
        'posts:read',
      ]) as Promise<Page>

    // A post's trending score decays with its age, so the score in page one's cursor is a hair above
    // the same post's score by the time page two runs. The REST route has this property too, so the
    // last post of a page can come back first on the next page; it never skips one.
    it('continues from page_info.end_cursor without skipping or going back', async () => {
      const first = await callPosts({ limit: 2 })
      expect(first.results.map(r => r.id)).toEqual(postIds.slice(0, 2))
      expect(first.page_info.has_next_page).toBe(true)
      expect(first.page_info.end_cursor).toEqual(expect.any(String))

      const second = await callPosts({ limit: 2, after: first.page_info.end_cursor })

      const secondIds = second.results.map(r => r.id)
      expect(secondIds).toContain(postIds[2])
      expect(secondIds).not.toContain(postIds[0])
      expect(secondIds.at(-1)).toBe(postIds[2])
      expect(second.page_info.has_next_page).toBe(false)
      expect(second.page_info.end_cursor).toBeNull()
    })

    it('returns the topic-not-found result', async () => {
      const result = await callStructuredMcpTool(
        caller,
        'get_trending_posts',
        { topic_id: `missing-topic-${crypto.randomUUID()}` },
        ['posts:read'],
      )

      expect(result).toEqual({ success: false, error: 'Topic not found' })
    })

    it('clamps an oversized limit like the REST route and rejects a non-positive one', async () => {
      const clamped = await callPosts({ limit: 100_000 })

      expect(clamped.results.map(r => r.id)).toEqual(postIds)
      await expect(
        callRejectedMcpTool(caller, 'get_trending_posts', { limit: 0 }, ['posts:read']),
      ).resolves.toContain('/limit must be >= 1')
    })

    it('refuses a cursor that is not a trending cursor', async () => {
      await expect(
        callRejectedMcpTool(caller, 'get_trending_posts', { after: 'not-a-cursor' }, [
          'posts:read',
        ]),
      ).resolves.toContain('Tool execution failed')
    })
  })

  describe('get_trending_topics', () => {
    const callTopics = (args: Record<string, unknown>) =>
      callStructuredMcpTool(caller, 'get_trending_topics', { time_range: 'week', ...args }, [
        'topics:read',
      ]) as Promise<Page>

    // A topic's score counts its recent tags, so it holds still between the two page requests.
    it('pages with no overlap and non-increasing scores', async () => {
      const first = await callTopics({ limit: 2 })
      expect(first.results).toHaveLength(2)
      expect(first.page_info.has_next_page).toBe(true)

      const second = await callTopics({ limit: 2, after: first.page_info.end_cursor })

      const firstIds = new Set(first.results.map(r => r.id))
      expect(second.results.length).toBeGreaterThan(0)
      expect(second.results.some(r => firstIds.has(r.id))).toBe(false)
      expect(second.results[0]!.trending_score).toBeLessThanOrEqual(
        first.results[1]!.trending_score,
      )
    })

    it('clamps an oversized limit like the REST route and rejects a non-positive one', async () => {
      const clamped = await callTopics({ limit: 100_000 })

      expect(clamped.results.length).toBeGreaterThan(0)
      expect(clamped.results.length).toBeLessThanOrEqual(100)
      await expect(
        callRejectedMcpTool(caller, 'get_trending_topics', { limit: 0 }, ['topics:read']),
      ).resolves.toContain('/limit must be >= 1')
    })
  })
})
