import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import {
  createTestRssFeedWithTiming,
  createTestTopic,
  createTestUser,
  followRssFeed,
} from '@voucha/test-helpers'
import { getRssFeedItemFeedIds } from '../get-ids.mts'
import { getRssFeedItemsByIdBatch } from '@services/rss-feed-items/get-batch'
import { upsertRssFeedItems } from '@services/rss-feed-items/upsert'

const ITEM_COUNT = 48
const PAGE_SIZE = 7
const ITEM_AGE_SPAN_MS = 6 * 24 * 60 * 60 * 1000

async function createRecentFeedItems(feedId: string) {
  const newest = Date.now() - 60_000
  const feedItems = Array.from({ length: ITEM_COUNT }, (_, index) => {
    const guid = randomUUID()
    return {
      guid,
      link: `https://example.com/${guid}`,
      title: index < 2 ? `weekneedlematch ${guid}` : `ordinary weekly item ${guid}`,
      isoDate: new Date(
        newest - ((ITEM_COUNT - index) * ITEM_AGE_SPAN_MS) / ITEM_COUNT,
      ).toISOString(),
    }
  })
  const items = await upsertRssFeedItems(feedId, feedItems)
  const persisted = await getRssFeedItemsByIdBatch(items.map(item => item.id))
  const itemIdsByGuid = new Map(
    persisted.flatMap(item => (item ? [[item.data.guid, item.id] as const] : [])),
  )
  return {
    feedItems,
    itemIdsByGuid,
  }
}

describe('personalized RSS weekly walk', () => {
  it('walks every eligible item through page cursors with one feed query per page', async () => {
    const viewer = await createTestUser()
    const feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feedId)
    const { feedItems, itemIdsByGuid } = await createRecentFeedItems(feedId)
    const expectedIds = feedItems
      .toSorted((a, b) => b.isoDate.localeCompare(a.isoDate))
      .map(item => itemIdsByGuid.get(item.guid)!)
    const capturePage = (after: string | undefined) =>
      withCapturedTestQueries(() =>
        getRssFeedItemFeedIds(viewer, {
          feed_type: 'follow_rss_feeds',
          time_range: 'all',
          limit: PAGE_SIZE,
          after,
        }),
      )
    const seen: string[] = []
    let after: string | undefined

    for (let pageIndex = 0; pageIndex < Math.ceil(ITEM_COUNT / PAGE_SIZE); pageIndex++) {
      const { result: page, queries } = await capturePage(after)
      expect(
        queries.filter(query => query.text.includes('/* getRssFeedItemFeedIds */')),
      ).toHaveLength(1)
      expect(page.results).toHaveLength(Math.min(PAGE_SIZE, ITEM_COUNT - seen.length))
      seen.push(...page.results.map(row => row.entity_id))
      expect(page.page_info.has_next_page).toBe(seen.length < ITEM_COUNT)
      after = page.page_info.end_cursor ?? undefined
    }

    expect(seen).toEqual(expectedIds)
    expect(new Set(seen).size).toBe(ITEM_COUNT)
  })

  it('finds rare old-prefix text matches in one query beyond the former window budget', async () => {
    const viewer = await createTestUser()
    const feedId = await createTestRssFeedWithTiming((await createTestTopic()).id)
    await followRssFeed(viewer, feedId)
    const { feedItems, itemIdsByGuid } = await createRecentFeedItems(feedId)
    const expectedIds = feedItems
      .filter(item => item.title.startsWith('weekneedlematch'))
      .toSorted((a, b) => b.isoDate.localeCompare(a.isoDate))
      .map(item => itemIdsByGuid.get(item.guid)!)

    const { result: page, queries } = await withCapturedTestQueries(() =>
      getRssFeedItemFeedIds(viewer, {
        feed_type: 'follow_rss_feeds',
        time_range: 'all',
        text_search_query: 'weekneedlematch',
        limit: 10,
      }),
    )
    expect(
      queries.filter(query => query.text.includes('/* getRssFeedItemFeedIds */')),
    ).toHaveLength(1)
    expect(page.results.map(row => row.entity_id)).toEqual(expectedIds)
    expect(page.page_info.has_next_page).toBe(false)
  })
})
