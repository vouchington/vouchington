import { describe, expect, it } from 'vitest'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { captureScopedTestQueries } from '@voucha/test-helpers/query-capture'
import { searchRssFeedItems } from './search.mts'

describe('searchRssFeedItems query planning', () => {
  it('inlines clamped page limits while binding the owned feed filter', async () => {
    const feed = await insertTestRssFeedDirect({})
    const queries = await captureScopedTestQueries(async () => {
      const page = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 10 })
      expect(page.results).toEqual([])
    })
    const searchQueries = queries.filter(query => query.text.includes('/* searchRssFeedItems */'))

    expect(searchQueries).toHaveLength(1)
    const [query] = searchQueries
    expect(query!.text).toMatch(
      /ORDER BY deduped_rss_feed_items\.published_at DESC, deduped_rss_feed_items\.id DESC\s+LIMIT 11\s*\)/,
    )
    expect(query!.text).toContain('SELECT COUNT(*)::int > 10 AS has_next_page')
    expect(query!.text).toMatch(
      /ORDER BY limited_rss_feed_items\.published_at DESC, limited_rss_feed_items\.id DESC\s+LIMIT 10\s*$/,
    )
    expect(query!.values).toEqual([[feed.id], [feed.id]])
  })
})
