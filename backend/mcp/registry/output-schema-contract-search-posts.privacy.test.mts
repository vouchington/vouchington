import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  muteUser,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import {
  seedMcpPostReadabilityFixtures,
  type McpPostReadabilityFixtures,
} from '@voucha/test-helpers/mcp-post-readability-fixtures'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = { results: { id: string }[] }
type Caller = PrivateUser & { membership_plan: null }

const SCOPES = ['posts:read'] as const
const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

// Discovery shares GET /api/v1/posts visibility, including owner and administrator access.
describe('read_posts.search discovery visibility — real DB', () => {
  const token = `srchpriv${crypto.randomUUID().replaceAll('-', '')}`
  const semanticQuery = `private post search ${crypto.randomUUID()}`
  const queryEmbedding = makeRandomEmbedding()
  let author: Caller
  let admin: Caller
  let stranger: Caller
  let fixtures: McpPostReadabilityFixtures
  let similarSeedId: string

  const search = async (as: Caller, args: Record<string, unknown>) => {
    const ids: string[] = []
    // Comments are searched only when asked for, so each mode runs once per post type.
    for (const post_type of [undefined, 'comment']) {
      const page = (await callStructuredMcpTool(
        as,
        'read_posts',
        optionArgs('search', { ...args, ...(post_type && { post_type }), limit: 100 }),
        SCOPES,
      )) as Page
      ids.push(...page.results.map(result => result.id))
    }
    return ids
  }

  const restSearch = async (as: Caller, args: Record<string, unknown>): Promise<string[]> => {
    const request = createRequest()
    await request.authenticateAs(as)
    const { similar_post_id, ...restArgs } = args
    const ids: string[] = []
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
      ids.push(...(response.body.results as { id: string }[]).map(result => result.id))
    }
    return ids
  }

  const modes = (): [string, Record<string, unknown>][] => [
    ['text_search_query', { text_search_query: token }],
    ['semantic_search_query', { semantic_search_query: semanticQuery }],
    ['similar_post_id', { similar_post_id: similarSeedId }],
  ]

  beforeAll(async () => {
    const authorUser = await createTestUser()
    author = asCaller(authorUser)
    admin = asCaller(await createTestUser({ administrator: true }))
    stranger = asCaller(await createTestUser())
    await seedSearchEmbeddingCache(semanticQuery, queryEmbedding)
    fixtures = await seedMcpPostReadabilityFixtures(authorUser, {
      token,
      embedding: queryEmbedding,
    })
    const seed = await createTestPost({ user: authorUser, title: `${token} similar seed` })
    await addDummyEmbeddingToPost(seed.id, { embedding: makeNearbyEmbedding(queryEmbedding) })
    similarSeedId = seed.id
  })

  it.each(['text_search_query', 'semantic_search_query', 'similar_post_id'])(
    'matches REST and keeps unrelated follower-only posts private through %s',
    async mode => {
      const args = modes().find(([name]) => name === mode)![1]
      const followerOnly = fixtures.hidden.find(post => post.label === 'followers-only post')!
      const mutualOnly = fixtures.hidden.find(post => post.label === 'mutual-followers-only post')!
      const recommendation = fixtures.hidden.find(post => post.label === 'topic recommendation')!
      const idsByCaller = new Map<string, string[]>()
      for (const caller of [author, admin, stranger]) {
        const mcpIds = await search(caller, args)
        idsByCaller.set(caller.id, mcpIds)
        const restIds = await restSearch(caller, args)
        expect(mcpIds.toSorted()).toEqual(restIds.toSorted())
        expect(mcpIds).toContain(fixtures.readable[0]!.id)
        expect(mcpIds).toContain(recommendation.id)
      }
      expect(idsByCaller.get(stranger.id)).not.toContain(followerOnly.id)
      expect(idsByCaller.get(stranger.id)).not.toContain(mutualOnly.id)
      expect(idsByCaller.get(author.id)).toEqual(
        expect.arrayContaining([followerOnly.id, mutualOnly.id]),
      )
      expect(idsByCaller.get(admin.id)).toEqual(
        expect.arrayContaining([followerOnly.id, mutualOnly.id]),
      )
    },
  )

  it('uses REST discovery visibility when a similar-post source is private or pending', async () => {
    // Each surface scans the default type and comments. The caller and label pairs are independent
    // empty-page checks, so they run together and stay inside the five-second cap.
    const pages = await Promise.all(
      [author, admin, stranger].flatMap(caller =>
        ['followers-only post', 'post awaiting review'].map(async label => {
          const seed = fixtures.hidden.find(post => post.label === label)!
          const [mcpIds, restIds] = await Promise.all([
            search(caller, { similar_post_id: seed.id }),
            restSearch(caller, { similar_post_id: seed.id }),
          ])
          return { mcpIds, restIds }
        }),
      ),
    )
    for (const { mcpIds, restIds } of pages) {
      expect(mcpIds).toEqual([])
      expect(restIds).toEqual([])
    }
  })

  it('matches REST discovery for a muted author', async () => {
    const mutedAuthor = await createTestUser()
    const viewer = await createTestUser({ administrator: true })
    await muteUser(viewer, mutedAuthor)
    const post = await createTestPost({ user: mutedAuthor, title: `${token} muted public` })
    await addDummyEmbeddingToPost(post.id, { embedding: makeNearbyEmbedding(queryEmbedding) })

    const mutedViewer = asCaller(viewer)
    for (const [, args] of modes().slice(0, 2)) {
      const mcpIds = await search(mutedViewer, args)
      const restIds = await restSearch(mutedViewer, args)
      expect(mcpIds).not.toContain(post.id)
      expect(restIds).not.toContain(post.id)
      expect(mcpIds.toSorted()).toEqual(restIds.toSorted())
    }
  })
})
