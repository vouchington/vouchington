import {
  addDummyEmbeddingToPost,
  blockUser,
  createTestPost,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  muteUser,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = {
  results: { id: string; title: string; markdown: string; post_type: string }[]
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

type Caller = PrivateUser & { membership_plan: null }

const SCOPES = ['posts:read'] as const
const EMPTY_PAGE_INFO = { has_next_page: false, start_cursor: null, end_cursor: null }

const asCaller = (user: PrivateUser): Caller => ({ ...user, membership_plan: null })

// Every result goes through the real call path, which checks it against the tool's published output
// schema. The cursor is the one the tool itself returned, fed back as `after`. A per-run token keeps
// each query to this file's fixtures in a shared database.
describe('MCP output schema contract for search_posts — real DB', () => {
  const token = `srchpost${crypto.randomUUID().replaceAll('-', '')}`
  let caller: Caller
  let textIds: string[]

  const search = (args: Record<string, unknown>, as: Caller = caller) =>
    callStructuredMcpTool(as, 'search_posts', args, SCOPES) as Promise<Page>

  beforeAll(async () => {
    const author = await createTestUser()
    caller = asCaller(await createTestUser())
    textIds = []
    for (const index of [1, 2, 3]) {
      const post = await createTestPost({
        user: author,
        title: `${token} fixture ${index}`,
        markdown: `${token} keyword body ${index}`,
      })
      textIds.push(post.id)
    }
  })

  it('pages keyword results with no overlap by following page_info.end_cursor', async () => {
    const first = await search({ text_search_query: token, limit: 2 })
    expect(first.results).toHaveLength(2)
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).toEqual(expect.any(String))

    const second = await search({
      text_search_query: token,
      limit: 2,
      after: first.page_info.end_cursor,
    })

    expect(second.results).toHaveLength(1)
    expect(second.page_info.has_next_page).toBe(false)
    const ids = [...first.results, ...second.results].map(result => result.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids.toSorted()).toEqual(textIds.toSorted())
  })

  it('matches q like the REST query and wraps the post text', async () => {
    const page = await search({ q: token })

    expect(page.results.map(result => result.id).toSorted()).toEqual(textIds.toSorted())
    expect(page.results[0]!.markdown).toContain('<external-content')
  })

  it('searches by meaning through semantic_search_query and pages the results', async () => {
    const query = `semantic post search ${crypto.randomUUID()}`
    const queryEmbedding = makeRandomEmbedding()
    await seedSearchEmbeddingCache(query, queryEmbedding)
    const author = await createTestUser()
    const semanticIds: string[] = []
    // The fixtures share no word with the query, so only the embedding can match them.
    for (const index of [1, 2, 3]) {
      const post = await createTestPost({
        user: author,
        title: `Unrelated ${crypto.randomUUID()} ${index}`,
        markdown: 'Fixture body that shares no words with the query.',
      })
      await addDummyEmbeddingToPost(post.id, { embedding: makeNearbyEmbedding(queryEmbedding) })
      semanticIds.push(post.id)
    }

    const first = await search({ semantic_search_query: query, limit: 2 })
    const second = await search({
      semantic_search_query: query,
      limit: 2,
      after: first.page_info.end_cursor,
    })

    expect(first.results).toHaveLength(2)
    expect(second.results).toHaveLength(1)
    const ids = [...first.results, ...second.results].map(result => result.id)
    expect(ids.toSorted()).toEqual(semanticIds.toSorted())
  })

  it('combines keyword and semantic matching for the search shortcut', async () => {
    const query = `${token} hybrid`
    const queryEmbedding = makeRandomEmbedding()
    await seedSearchEmbeddingCache(query, queryEmbedding)
    const author = await createTestUser()
    const embedded = await createTestPost({ user: author, title: `${query} with embedding` })
    await addDummyEmbeddingToPost(embedded.id, { embedding: makeNearbyEmbedding(queryEmbedding) })
    await createTestPost({ user: author, title: `${query} without embedding` })

    const page = await search({ search: query })

    expect(page.results.map(result => result.id)).toEqual([embedded.id])
  })

  it('keeps muted and blocked authors out of the caller results only', async () => {
    const mutedAuthor = await createTestUser()
    const blockedAuthor = await createTestUser()
    const viewer = asCaller(await createTestUser())
    await muteUser(viewer, mutedAuthor)
    await blockUser(viewer, blockedAuthor)
    const muted = await createTestPost({ user: mutedAuthor, title: `${token} muted author post` })
    const blocked = await createTestPost({ user: blockedAuthor, title: `${token} blocked author` })

    const viewerIds = (await search({ text_search_query: token, limit: 100 }, viewer)).results.map(
      result => result.id,
    )
    const callerIds = (await search({ text_search_query: token, limit: 100 })).results.map(
      result => result.id,
    )

    expect(viewerIds).toEqual(expect.arrayContaining(textIds))
    expect(viewerIds).not.toContain(muted.id)
    expect(viewerIds).not.toContain(blocked.id)
    expect(callerIds).toEqual(expect.arrayContaining([muted.id, blocked.id]))
  })

  it('filters by post_type', async () => {
    const discussions = await search({ text_search_query: token, post_type: 'discussion' })
    const reviews = await search({ text_search_query: token, post_type: 'review' })

    expect(discussions.results.map(result => result.id)).toEqual(expect.arrayContaining(textIds))
    expect(discussions.results.every(result => result.post_type === 'discussion')).toBe(true)
    expect(reviews).toEqual({ success: true, results: [], page_info: EMPTY_PAGE_INFO })
  })

  it('returns an empty page for an identifier that resolves to nothing', async () => {
    const page = await search({ similar_post_id: crypto.randomUUID() })

    expect(page).toEqual({ success: true, results: [], page_info: EMPTY_PAGE_INFO })
  })

  it('clamps an oversized limit like the REST route and rejects what REST rejects', async () => {
    const clamped = await search({ text_search_query: token, limit: 100_000 })

    expect(clamped.results.length).toBeGreaterThanOrEqual(3)
    expect(clamped.results.length).toBeLessThanOrEqual(100)
    await expect(
      callRejectedMcpTool(caller, 'search_posts', { limit: 0 }, SCOPES),
    ).resolves.toContain('/limit must be >= 1')
    await expect(
      callRejectedMcpTool(caller, 'search_posts', { sort: 'ranking' }, SCOPES),
    ).resolves.toContain('/sort must be equal to one of the allowed values')
  })

  it('reports a malformed or foreign cursor as a normal Invalid cursor result', async () => {
    const newest = await search({ text_search_query: token, sort: 'new', limit: 2 })

    const malformed = await callStructuredMcpTool(
      caller,
      'search_posts',
      { text_search_query: token, after: 'not-a-cursor' },
      SCOPES,
    )
    // A sort=new cursor holds only an id, so another sort refuses it.
    const foreign = await callStructuredMcpTool(
      caller,
      'search_posts',
      { text_search_query: token, sort: 'best', after: newest.page_info.end_cursor },
      SCOPES,
    )

    expect(malformed).toEqual({ success: false, error: 'Invalid cursor' })
    expect(foreign).toEqual({ success: false, error: 'Invalid cursor' })
  })
})
