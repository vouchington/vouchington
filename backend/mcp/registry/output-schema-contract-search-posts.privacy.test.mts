import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  muteUser,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  seedMcpPostReadabilityFixtures,
  type McpPostReadabilityFixtures,
} from '@voucha/test-helpers/mcp-post-readability-fixtures'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = { results: { id: string }[] }
type Caller = PrivateUser & { membership_plan: null }

const SCOPES = ['posts:read'] as const
const EMPTY_PAGE = {
  success: true,
  results: [],
  page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
}

const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

// search_posts reads as the credential owner minus private data, like get_post: the owner's own
// private, audience-limited and not-yet-cleared posts stay out of the results, and so do the
// comments of a thread that get_post would refuse. Every fixture matches all three search modes, so
// what a search leaves out is left out by the read policy alone.
describe('search_posts read policy — real DB', () => {
  const token = `srchpriv${crypto.randomUUID().replaceAll('-', '')}`
  const semanticQuery = `private post search ${crypto.randomUUID()}`
  const queryEmbedding = makeRandomEmbedding()
  let author: Caller
  let admin: Caller
  let fixtures: McpPostReadabilityFixtures
  let similarSeedId: string

  const search = async (as: Caller, args: Record<string, unknown>) => {
    const ids: string[] = []
    // Comments are searched only when asked for, so each mode runs once per post type.
    for (const post_type of [undefined, 'comment']) {
      const page = (await callStructuredMcpTool(
        as,
        'search_posts',
        { ...args, ...(post_type && { post_type }), limit: 100 },
        SCOPES,
      )) as Page
      ids.push(...page.results.map(result => result.id))
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
    'finds the public posts and none of the hidden ones through %s, for the author and an admin',
    async mode => {
      const args = modes().find(([name]) => name === mode)![1]

      for (const caller of [author, admin]) {
        const ids = await search(caller, args)

        expect(ids).toEqual(expect.arrayContaining(fixtures.readable.map(post => post.id)))
        // The labels name the leaked fixtures when this fails.
        expect(
          fixtures.hidden.filter(post => ids.includes(post.id)).map(post => post.label),
        ).toEqual([])
      }
    },
  )

  it('answers a hidden similar_post_id exactly like an id that matches nothing', async () => {
    for (const caller of [author, admin]) {
      const answers: Record<string, unknown> = {}
      for (const seed of fixtures.hidden) {
        answers[seed.label] = await callStructuredMcpTool(
          caller,
          'search_posts',
          { similar_post_id: seed.id },
          SCOPES,
        )
      }

      expect(answers).toEqual(
        Object.fromEntries(fixtures.hidden.map(seed => [seed.label, EMPTY_PAGE])),
      )
    }
  })

  it('still keeps the owner’s muted authors out of the public results', async () => {
    const mutedAuthor = await createTestUser()
    const viewer = await createTestUser({ administrator: true })
    await muteUser(viewer, mutedAuthor)
    const post = await createTestPost({ user: mutedAuthor, title: `${token} muted public` })
    await addDummyEmbeddingToPost(post.id, { embedding: makeNearbyEmbedding(queryEmbedding) })

    for (const [, args] of modes().slice(0, 2)) {
      expect(await search(asCaller(viewer), args)).not.toContain(post.id)
      expect(await search(admin, args)).toContain(post.id)
    }
  })
})
