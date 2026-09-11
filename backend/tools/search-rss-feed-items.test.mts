import { describe, expect, it } from 'vitest'
import searchRssFeedItemsTool from './search-rss-feed-items.mts'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'
import { createTestRssFeed } from '@services/rss-feeds/test-fixtures'

describe('search-rss-feed-items', () => {
  it('searchRssFeedItemsTool schema exposes hybrid and split search fields', () => {
    const properties = (
      searchRssFeedItemsTool.schema.parameters as { properties: Record<string, unknown> }
    ).properties

    expect(properties.search).toBeDefined()
    expect(properties.text_search_query).toBeDefined()
    expect(properties.semantic_search_query).toBeDefined()
    expect(properties.similar_post_id).toBeDefined()
    expect(properties.similar_topic_id).toBeDefined()
    expect(properties.similar_rss_feed_item_id).toBeDefined()
  })

  it('searchRssFeedItemsTool wraps content from real feed items', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const feed = await createTestRssFeed({})
    await upsertRssFeedItems(feed.id, [
      {
        link: `https://example.com/wrapped-${suffix}`,
        guid: `wrapped-${suffix}`,
        title: `Wrapped item ${suffix}`,
        description: '<script>x</script>Visible description for agents.',
        pubDate: '2025-01-01T00:00:00Z',
      },
    ])

    const execute = searchRssFeedItemsTool.function(null as never)
    const result = await execute({
      text_search_query: `Wrapped item ${suffix}`,
    })

    expect(result.success).toBe(true)
    expect(result.results).toHaveLength(1)
    expect(result.results[0].markdown).toContain('<external-content')
    expect(result.results[0].markdown).not.toContain('<script>')
  })

  it('searchRssFeedItemsTool uses default limit of 10 when not provided', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const feed = await createTestRssFeed({})
    await upsertRssFeedItems(
      feed.id,
      Array.from({ length: 12 }, (_, index) => ({
        link: `https://example.com/default-${suffix}-${index}`,
        guid: `default-${suffix}-${index}`,
        title: `Default Limit RSS ${suffix}`,
        description: `Default limit item ${index}`,
        pubDate: `2025-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
      })),
    )

    const execute = searchRssFeedItemsTool.function(null as never)
    const result = await execute({ text_search_query: `Default Limit RSS ${suffix}` })

    expect(result.results).toHaveLength(10)
  })
})
