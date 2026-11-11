import { optionArgs, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { createRequest } from '@voucha/test-helpers/api/server'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = { results: { id: string; markdown: string }[] }
type Caller = PrivateUser & { membership_plan: null }

const SCOPES = ['posts:read'] as const
const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

// Semantic discovery uses the same viewer eligibility as GET /api/v1/posts. Only the embedding
// can match these fixtures, and each one has its own nearby vector.
describe('read_posts.search semantic visibility — real DB', () => {
  const query = `semantic visibility ${crypto.randomUUID()}`
  let author: Caller
  let viewer: Caller
  let stranger: Caller
  let ids: { open: string; ownFlagged: string; otherFlagged: string; recommendation: string }

  const search = (as: Caller) =>
    callStructuredMcpTool(
      as,
      'read_posts',
      optionArgs('search', { semantic_search_query: query }),
      SCOPES,
    ).then(page => (page as Page).results.map(result => result.id))

  const searchAndMatchRest = async (as: Caller): Promise<string[]> => {
    const mcpIds = await search(as)
    const request = createRequest()
    await request.authenticateAs(as)
    const rest = await request
      .get('/api/v1/posts')
      .query({ semantic_search_query: query })
      .expect(200)
    const restIds = (rest.body.results as { id: string }[]).map(result => result.id)
    expect(mcpIds.toSorted()).toEqual(restIds.toSorted())
    return mcpIds
  }

  const queryEmbedding = makeRandomEmbedding()

  const seed = async (
    user: PrivateUser,
    label: string,
    flagged: boolean,
    post_type?: 'topic_recommendation',
  ) => {
    const post = await createTestPost({
      user,
      post_type,
      title: `Unrelated ${label} ${crypto.randomUUID()}`,
      markdown: 'Fixture body that shares no words with the query.',
    })
    await addDummyEmbeddingToPost(post.id, {
      flagged,
      embedding: makeNearbyEmbedding(queryEmbedding),
    })
    return post.id
  }

  beforeAll(async () => {
    await seedSearchEmbeddingCache(query, queryEmbedding)
    const authorUser = await createTestUser()
    const otherUser = await createTestUser()
    author = asCaller(authorUser)
    viewer = asCaller(otherUser)
    stranger = asCaller(await createTestUser())
    ids = {
      open: await seed(authorUser, 'open', false),
      ownFlagged: await seed(authorUser, 'own flagged', true),
      otherFlagged: await seed(otherUser, 'other flagged', true),
      recommendation: await seed(authorUser, 'recommendation', false, 'topic_recommendation'),
    }
  })

  it('shows each author their flagged post and matches REST discovery', async () => {
    const authorIds = await searchAndMatchRest(author)
    const viewerIds = await searchAndMatchRest(viewer)

    expect(authorIds).toEqual(
      expect.arrayContaining([ids.open, ids.ownFlagged, ids.recommendation]),
    )
    expect(authorIds).not.toContain(ids.otherFlagged)
    expect(viewerIds).toEqual(
      expect.arrayContaining([ids.open, ids.otherFlagged, ids.recommendation]),
    )
    expect(viewerIds).not.toContain(ids.ownFlagged)
  })

  it('keeps both authors’ flagged posts from an unrelated viewer', async () => {
    const strangerIds = await searchAndMatchRest(stranger)

    expect(strangerIds).toEqual(expect.arrayContaining([ids.open, ids.recommendation]))
    expect(strangerIds).not.toContain(ids.ownFlagged)
    expect(strangerIds).not.toContain(ids.otherFlagged)
  })
})
