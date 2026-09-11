import { createTestTopic, createTestUser } from '@voucha/test-helpers'
import { expect, it, describe } from 'vitest'
import searchTopicsTool from './search-topics.mts'

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
    const execute = searchTopicsTool.function(null as never)
    const result = await execute({ text_search_query: name, limit: 100 })

    expect(result.success).toBe(true)
    expect(result.topics).toContainEqual(
      expect.objectContaining({ id: topic.id, name: topic.name, slug: topic.slug }),
    )
  })

  it('clamps limit to max 25', async () => {
    const marker = `Agent Limit Topic ${crypto.randomUUID()}`
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    for (const index of Array.from({ length: 30 }, (_, value) => value)) {
      await createTestTopic({ user, name: `${marker} ${index.toString().padStart(2, '0')}` })
    }
    const execute = searchTopicsTool.function(null as never)
    const result = await execute({ text_search_query: marker, limit: 100 })

    expect(result.topics).toHaveLength(25)
  })
})
