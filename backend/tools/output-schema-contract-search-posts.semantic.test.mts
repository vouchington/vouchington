import {
  addDummyEmbeddingToPost,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = { results: { id: string; markdown: string }[] }
type Caller = PrivateUser & { membership_plan: null }

const SCOPES = ['posts:read'] as const
const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

// Visibility is the MCP read policy (see the privacy and agreement tests), so this checks the
// semantic path through the real call path: only the embedding can match these fixtures, and each
// one has its own nearby vector.
describe('search_posts semantic visibility — real DB', () => {
  const query = `semantic visibility ${crypto.randomUUID()}`
  let author: Caller
  let viewer: Caller
  let ids: { open: string; ownFlagged: string; otherFlagged: string; recommendation: string }

  const search = (as: Caller) =>
    callStructuredMcpTool(as, 'search_posts', { semantic_search_query: query }, SCOPES).then(page =>
      (page as Page).results.map(result => result.id),
    )

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
    ids = {
      open: await seed(authorUser, 'open', false),
      ownFlagged: await seed(authorUser, 'own flagged', true),
      otherFlagged: await seed(otherUser, 'other flagged', true),
      recommendation: await seed(authorUser, 'recommendation', false, 'topic_recommendation'),
    }
  })

  it('hides a flagged post from every caller, including its own author', async () => {
    for (const caller of [author, viewer]) {
      const callerIds = await search(caller)

      expect(callerIds).toContain(ids.open)
      expect(callerIds).not.toContain(ids.ownFlagged)
      expect(callerIds).not.toContain(ids.otherFlagged)
    }
  })

  it('leaves topic recommendations out of the results', async () => {
    expect(await search(author)).not.toContain(ids.recommendation)
  })
})
