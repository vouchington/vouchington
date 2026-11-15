import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  beginTransaction,
  createTestRssFeedItemWithUrl,
  createTestRssFeedWithTiming,
  createTestTopic,
} from '@voucha/test-helpers'
import { getDateFromUUIDv7 } from '@modules/utils/ids'
import { upsertRssFeedItemCategories } from '@services/rss-feed-items/categories'
import {
  type AliasCategoryCursor,
  readAliasCategoryRawPage,
} from '../topic-alias-category-raw-page.mts'

describe('topic alias category sweep bound', () => {
  it('bounds the sweep at its start time and covers rows created before it', async () => {
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
    const startedAt = Date.now()
    const first = await readAliasCategoryRawPage(query, randomUUID(), categoryText, start, 10)
    const finishedAt = Date.now()
    expect(first.rows.map(row => row.rss_feed_item_id)).toEqual([before.id])

    const bound = first.cursor.sweep_upper_bound_item_id
    expect(bound).toBe(first.cursor.sweep_upper_bound_feed_id)
    const boundTime = getDateFromUUIDv7(bound!).getTime()
    expect(boundTime).toBeGreaterThanOrEqual(getDateFromUUIDv7(before.id).getTime())
    expect(boundTime).toBeGreaterThanOrEqual(startedAt)
    expect(boundTime).toBeLessThanOrEqual(finishedAt)
  })
})
