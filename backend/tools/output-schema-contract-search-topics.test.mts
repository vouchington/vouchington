import { createHash } from 'node:crypto'
import {
  createTestTopic,
  createTestUser,
  makeNearbyEmbedding,
  makeRandomEmbedding,
  seedSearchEmbeddingCache,
} from '@voucha/test-helpers'
import { updateTopicEmbeddingData } from '@voucha/test-helpers/entities/topics/embeddings'
import { callRejectedMcpTool, callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import type { PrivateUser } from '@services/users/types'
import { beforeAll, describe, expect, it } from 'vitest'

type Page = {
  topics: { id: string; name: string; slug: string }[]
  page_info: { has_next_page: boolean; start_cursor: string | null; end_cursor: string | null }
}

const SCOPES = ['topics:read'] as const
const EMPTY_PAGE_INFO = { has_next_page: false, start_cursor: null, end_cursor: null }

// Every result goes through the real call path, which checks it against the tool's published output
// schema. The cursor is the one the tool itself returned, fed back as `after`. A per-run token keeps
// each query to this file's fixtures in a shared database.
describe('MCP output schema contract for search_topics — real DB', () => {
  const token = `srchtopic${crypto.randomUUID().replaceAll('-', '')}`
  let caller: PrivateUser & { membership_plan: null }
  let textIds: string[]

  const search = (args: Record<string, unknown>) =>
    callStructuredMcpTool(caller, 'search_topics', args, SCOPES) as Promise<Page>

  beforeAll(async () => {
    const user = await createTestUser()
    caller = { ...user, membership_plan: null }
    textIds = []
    for (const index of [1, 2, 3]) {
      const topic = await createTestTopic({ user, name: `${token} fixture ${index}` })
      textIds.push(topic.id)
    }
  })

  it('pages keyword results with no overlap by following page_info.end_cursor', async () => {
    const first = await search({ text_search_query: token, limit: 2 })
    expect(first.topics).toHaveLength(2)
    expect(first.page_info.has_next_page).toBe(true)
    expect(first.page_info.end_cursor).toEqual(expect.any(String))

    const second = await search({
      text_search_query: token,
      limit: 2,
      after: first.page_info.end_cursor,
    })

    expect(second.topics).toHaveLength(1)
    expect(second.page_info.has_next_page).toBe(false)
    const ids = [...first.topics, ...second.topics].map(topic => topic.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids.toSorted()).toEqual(textIds.toSorted())
  })

  it('matches q like the REST query', async () => {
    const page = await search({ q: token })

    expect(page.topics.map(topic => topic.id).toSorted()).toEqual(textIds.toSorted())
  })

  it('searches by meaning through semantic_search_query and pages the results', async () => {
    const query = `semantic topic search ${crypto.randomUUID()}`
    const queryEmbedding = makeRandomEmbedding()
    await seedSearchEmbeddingCache(query, queryEmbedding)
    const user = await createTestUser()
    const semanticIds: string[] = []
    // The fixtures share no word with the query, so only the embedding can match them.
    for (const index of [1, 2, 3]) {
      const topic = await createTestTopic({
        user,
        name: `Unrelated ${crypto.randomUUID()} ${index}`,
      })
      await updateTopicEmbeddingData({
        topicId: topic.id,
        inputSha256: createHash('sha256').update(`${query}:${index}`).digest(),
        embedding: makeNearbyEmbedding(queryEmbedding),
        tokens: 10,
      })
      semanticIds.push(topic.id)
    }

    const first = await search({ semantic_search_query: query, limit: 2 })
    const second = await search({
      semantic_search_query: query,
      limit: 2,
      after: first.page_info.end_cursor,
    })

    expect(first.topics).toHaveLength(2)
    expect(second.topics).toHaveLength(1)
    const ids = [...first.topics, ...second.topics].map(topic => topic.id)
    expect(ids.toSorted()).toEqual(semanticIds.toSorted())
  })

  it('returns an empty page for an identifier that resolves to nothing', async () => {
    const page = await search({ similar_topic_id: crypto.randomUUID() })

    expect(page).toEqual({ success: true, topics: [], page_info: EMPTY_PAGE_INFO })
  })

  it('clamps an oversized limit like the REST route and rejects what REST rejects', async () => {
    const clamped = await search({ text_search_query: token, limit: 100_000 })

    expect(clamped.topics.map(topic => topic.id).toSorted()).toEqual(textIds.toSorted())
    await expect(
      callRejectedMcpTool(caller, 'search_topics', { limit: 0 }, SCOPES),
    ).resolves.toContain('/limit must be >= 1')
  })

  it('reports a malformed or foreign cursor as a normal Invalid cursor result', async () => {
    const textPage = await search({ text_search_query: token, limit: 2 })

    const malformed = await callStructuredMcpTool(
      caller,
      'search_topics',
      { text_search_query: token, after: 'not-a-cursor' },
      SCOPES,
    )
    // A keyword-search cursor holds a relevance tier, which a search without keywords refuses.
    const foreign = await callStructuredMcpTool(
      caller,
      'search_topics',
      { after: textPage.page_info.end_cursor },
      SCOPES,
    )

    expect(malformed).toEqual({ success: false, error: 'Invalid cursor' })
    expect(foreign).toEqual({ success: false, error: 'Invalid cursor' })
  })
})
