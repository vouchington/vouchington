import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  seedMcpPostReadabilityFixtures,
  type McpPostReadabilityFixtures,
} from '@voucha/test-helpers/mcp-post-readability-fixtures'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type Caller = PrivateUser & { membership_plan: null }

const SCOPES = ['posts:read'] as const
const NOT_FOUND = { success: false, error: 'Post not found' }

const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

// search_posts and get_post share one read policy. A search result is a post get_post can open,
// and a post get_post refuses never shows up in a search, whoever asks and however they search.
describe('search_posts agrees with get_post — real DB', () => {
  const token = `srchagree${crypto.randomUUID().replaceAll('-', '')}`
  const semanticQuery = `agreement post search ${crypto.randomUUID()}`
  const queryEmbedding = makeRandomEmbedding()
  let callers: Caller[]
  let fixtures: McpPostReadabilityFixtures
  let searches: Record<string, unknown>[]

  const call = (caller: Caller, name: string, args: Record<string, unknown>) =>
    callStructuredMcpTool(caller, name, args, SCOPES)

  const searchIds = async (caller: Caller, args: Record<string, unknown>) => {
    const ids: string[] = []
    for (const post_type of [undefined, 'comment']) {
      const page = await call(caller, 'search_posts', {
        ...args,
        ...(post_type && { post_type }),
        limit: 100,
      })
      ids.push(...(page['results'] as { id: string }[]).map(result => result.id))
    }
    return ids
  }

  beforeAll(async () => {
    const author = await createTestUser()
    callers = [asCaller(author), asCaller(await createTestUser({ administrator: true }))]
    await seedSearchEmbeddingCache(semanticQuery, queryEmbedding)
    fixtures = await seedMcpPostReadabilityFixtures(author, { token, embedding: queryEmbedding })
    const seed = await createTestPost({ user: author, title: `${token} similar seed` })
    await addDummyEmbeddingToPost(seed.id, { embedding: makeNearbyEmbedding(queryEmbedding) })
    searches = [
      { text_search_query: token },
      { semantic_search_query: semanticQuery },
      { similar_post_id: seed.id },
    ]
  })

  it('opens the readable fixtures and answers every hidden fixture as not found', async () => {
    for (const caller of callers) {
      const answers: Record<string, unknown> = {}
      for (const post of [...fixtures.readable, ...fixtures.hidden]) {
        const answer = await call(caller, 'get_post', { post_id: post.id })
        answers[post.label] = answer['success'] ? 'opened' : answer
      }

      expect(answers).toEqual({
        ...Object.fromEntries(fixtures.readable.map(post => [post.label, 'opened'])),
        ...Object.fromEntries(fixtures.hidden.map(post => [post.label, NOT_FOUND])),
      })
    }
  })

  it('returns only posts that get_post opens, in every search mode', async () => {
    for (const caller of callers) {
      for (const args of searches) {
        const ids = [...new Set(await searchIds(caller, args))]
        const refused: unknown[] = []
        for (const id of ids) {
          const answer = await call(caller, 'get_post', { post_id: id })
          if (!answer['success']) refused.push({ id, answer })
        }

        expect(ids.length).toBeGreaterThan(0)
        expect(refused).toEqual([])
      }
    }
  })
})
