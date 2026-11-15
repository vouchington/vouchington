import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
} from '@voucha/test-helpers'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import {
  type AliasCategoryCursor,
  readAliasCategoryRawPage,
} from '../topic-alias-category-raw-page.mts'

describe('topic alias category sweep bound', () => {
  it('covers rows created before the sweep starts and leaves later ids to the next sweep', async () => {
    const categoryText = `sweep-bound-${randomUUID()}`
    const feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    const before = await createTestRssFeedItemWithUrl(feedId)
    await upsertRssFeedItemCategories([{ rss_feed_item_id: before.id, categories: [categoryText] }])
    const start: AliasCategoryCursor = {
      phase: 'rss_item_text_categories',
      sweep_upper_bound_item_id: null,
      sweep_upper_bound_feed_id: null,
      cursor_item_id: null,
      cursor_category_identity_id: null,
      cursor_feed_id: null,
    }

    await using query = await beginTransaction()
    const first = await readAliasCategoryRawPage(query, randomUUID(), categoryText, start, 10)
    expect(first.rows.map(row => row.rss_feed_item_id)).toEqual([before.id])

    const later = await createTestRssFeedItemWithUrl(feedId, {
      id: getMinUUIDv7ForDate(new Date(Date.now() + 1000)),
    })
    await upsertRssFeedItemCategories([{ rss_feed_item_id: later.id, categories: [categoryText] }])
    const resumed = await readAliasCategoryRawPage(
      query,
      randomUUID(),
      categoryText,
      {
        ...start,
        sweep_upper_bound_item_id: first.cursor.sweep_upper_bound_item_id,
        sweep_upper_bound_feed_id: first.cursor.sweep_upper_bound_feed_id,
      },
      10,
    )
    expect(resumed.rows.map(row => row.rss_feed_item_id)).toEqual([before.id])
  })
})
