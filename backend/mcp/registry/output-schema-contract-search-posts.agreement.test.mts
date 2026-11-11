import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import {
  seedMcpPostReadabilityFixtures,
  type McpPostReadabilityFixtures,
} from '@voucha/test-helpers/mcp-post-readability-fixtures'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { beforeAll, describe, expect, it } from 'vitest'

type Caller = PrivateUser & { membership_plan: null }

const SCOPES = ['posts:read'] as const
const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

// Search discovery follows GET /api/v1/posts. Direct post details have their own read policy.
describe('read_posts.search agrees with GET /api/v1/posts — real DB', () => {
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
      const page = await call(
        caller,
        'read_posts',
        optionArgs('search', {
          ...args,
          ...(post_type && { post_type }),
          limit: 100,
        }),
      )
      ids.push(...(page['results'] as { id: string }[]).map(result => result.id))
    }
    return ids
  }

  beforeAll(async () => {
    const author = await createTestUser()
    callers = [
      asCaller(author),
      asCaller(await createTestUser({ administrator: true })),
      asCaller(await createTestUser()),
    ]
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

  it('matches REST discovery for keyword, semantic, and similar-post searches', async () => {
    for (const caller of callers) {
      for (const args of searches) {
        const mcpIds = await searchIds(caller, args)
        const request = createRequest()
        await request.authenticateAs(caller)
        const restIds: string[] = []
        const { similar_post_id, ...restArgs } = args
        for (const post_type of [undefined, 'comment']) {
          const response = await request
            .get('/api/v1/posts')
            .query({
              ...restArgs,
              ...(typeof similar_post_id === 'string' && { similar_post: similar_post_id }),
              ...(post_type && { post_types: post_type }),
              limit: 100,
            })
            .expect(200)
          restIds.push(...(response.body.results as { id: string }[]).map(result => result.id))
        }
        expect(mcpIds.toSorted()).toEqual(restIds.toSorted())
        expect(mcpIds).toContain(fixtures.readable[0]!.id)
      }
    }
  })

  it('keeps follower-only private posts out for an unrelated viewer', async () => {
    const stranger = callers.at(-1)!
    const followersOnly = fixtures.hidden.find(post => post.label === 'followers-only post')!
    const mutualOnly = fixtures.hidden.find(post => post.label === 'mutual-followers-only post')!
    const strangerIds = await searchIds(stranger, { text_search_query: token })
    expect(strangerIds).not.toContain(followersOnly.id)
    expect(strangerIds).not.toContain(mutualOnly.id)
    for (const caller of callers.slice(0, -1)) {
      const ids = await searchIds(caller, { text_search_query: token })
      expect(ids).toEqual(expect.arrayContaining([followersOnly.id, mutualOnly.id]))
    }
  })
})
