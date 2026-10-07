import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { expect, it, describe } from 'vitest'
import searchTopicsTool from './search-topics.mts'

type SearchArgs = Parameters<ReturnType<typeof searchTopicsTool.function>>[0]

// Runs the tool and returns its page of results, failing the test on the Invalid cursor result.
const searchPage = async (args: SearchArgs) => {
  const result = await searchTopicsTool.function(null as never)(args)
  if (!result.success) throw new Error(result.error)
  return result
}

describe('search-topics', () => {
  it('searchTopicsTool schema exposes hybrid and split search fields', () => {
    const properties = (
      searchTopicsTool.schema.parameters as { properties: Record<string, unknown> }
    ).properties

    expect(properties.search).toBeDefined()
    expect(properties.text_search_query).toBeDefined()
    expect(properties.semantic_search_query).toBeDefined()
    expect(properties.similar_rss_feed_item_id).toBeDefined()
  })

  it('searchTopicsTool returns real text search results', async () => {
    const name = `Agent Search Topic ${crypto.randomUUID()}`
    const topic = await createTestTopic({ name })
    const execute = searchPage
    const result = await execute({ text_search_query: name, limit: 100 })

    expect(result.success).toBe(true)
    expect(result.topics).toContainEqual(
      expect.objectContaining({ id: topic.id, name: topic.name, slug: topic.slug }),
    )
  })

  it('defaults to 25 results and clamps an oversized limit instead of refusing it', async () => {
    const marker = `Agent Limit Topic ${crypto.randomUUID()}`
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    for (const index of Array.from({ length: 30 }, (_, value) => value)) {
      await createTestTopic({ user, name: `${marker} ${index.toString().padStart(2, '0')}` })
    }
    const execute = searchPage
    const defaulted = await execute({ text_search_query: marker })
    const oversized = await execute({ text_search_query: marker, limit: 100_000 })

    expect(defaulted.topics).toHaveLength(25)
    expect(defaulted.page_info.has_next_page).toBe(true)
    expect(oversized.topics).toHaveLength(30)
    expect(oversized.page_info.has_next_page).toBe(false)
  })
})
