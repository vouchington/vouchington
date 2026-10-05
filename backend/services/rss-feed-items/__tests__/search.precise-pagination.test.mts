import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { insertTestRssFeedDirect } from '@voucha/test-helpers'
import { searchRssFeedItems } from '../search.mts'
import { upsertRssFeedItems } from '../upsert.mts'

describe('RSS recency precise pagination', () => {
  it('traverses microsecond publication ties without gaps', async () => {
    const feed = await insertTestRssFeedDirect({})
    const items = await upsertRssFeedItems(
      feed.id,
      [456, 456, 455, 0].map(microseconds => {
        const guid = randomUUID()
        return {
          guid,
          link: `https://example.com/${guid}`,
          title: 'Precise publication',
          isoDate: `2020-01-02T03:04:05.123${String(microseconds).padStart(3, '0')}Z`,
        }
      }),
    )
    const expected = [items[0].id, items[1].id]
      .toSorted()
      .toReversed()
      .concat(items.slice(2).map(item => item.id))
    const seen: string[] = []
    let after: string | undefined
    for (let page = 0; page < 5; page++) {
      const result = await searchRssFeedItems({ rss_feed_ids: [feed.id], limit: 1, after })
      seen.push(...result.results.map(item => item.id))
      if (!result.page_info.has_next_page) break
      expect(result.page_info.end_cursor).toEqual(expect.any(String))
      after = result.page_info.end_cursor!
    }
    expect(seen).toEqual(expected)
  })
  it('rejects replay across filters and viewers', async () => {
    const feed = await insertTestRssFeedDirect({})
    await upsertRssFeedItems(
      feed.id,
      [0, 1].map(index => {
        const guid = randomUUID()
        return {
          guid,
          link: `https://example.com/${guid}`,
          title: 'Scope publication',
          isoDate: `2020-01-02T03:04:0${index}.123456Z`,
        }
      }),
    )
    const options = { rss_feed_ids: [feed.id], limit: 1 }
    const first = await searchRssFeedItems(options)
    const after = first.page_info.end_cursor!
    await expect(
      searchRssFeedItems({ ...options, after, text_search_query: 'different' }),
    ).rejects.toMatchObject({ status: 400 })
    await expect(
      searchRssFeedItems({ ...options, after, currentUserId: randomUUID() }),
    ).rejects.toMatchObject({ status: 400 })
    const next = await searchRssFeedItems({
      ...options,
      after,
      rss_feed_ids: [feed.id, feed.id],
      limit: 25,
    })
    expect(next.results).toHaveLength(1)
    expect(next.page_info.has_next_page).toBe(false)
  })
})
