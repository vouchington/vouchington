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

// Visibility comes from the shared REST query, so this checks the semantic path through the real
// call path: only the embedding can match these fixtures, and each one has its own nearby vector.
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

  it('shows the caller their own flagged post and hides other callers flagged posts', async () => {
    const authorIds = await search(author)

    expect(authorIds).toEqual(expect.arrayContaining([ids.open, ids.ownFlagged]))
    expect(authorIds).not.toContain(ids.otherFlagged)
    const viewerIds = await search(viewer)
    expect(viewerIds).toEqual(expect.arrayContaining([ids.open, ids.otherFlagged]))
    expect(viewerIds).not.toContain(ids.ownFlagged)
  })

  it('leaves topic recommendations out of the results', async () => {
    expect(await search(author)).not.toContain(ids.recommendation)
  })
})
