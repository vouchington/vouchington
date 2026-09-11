import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import {
  buildRssFeedItemFeedPageInfo,
  getCutoffDateForTimeRange,
  parseRssFeedItemFeedCursor,
} from './query-utils.mts'

describe('rss feed item feed query utils', () => {
  it('parseRssFeedItemFeedCursor supports shared item cursors keyed by share event id', () => {
    const timestamp = Date.UTC(2026, 0, 2)
    const shareEventId = '0194f68a-2d69-7db5-99c8-59e66b0f8f70'

    // Share cursors are encoded with "share:" prefix to distinguish from direct item cursors
    const result = parseRssFeedItemFeedCursor(
      encodeCursor({ timestamp, id: `share:${shareEventId}` }),
    )

    expect(result).toEqual({
      published_lt: timestamp,
      share_event_id_lt: shareEventId,
    })
  })

  it('parseRssFeedItemFeedCursor supports direct item cursors keyed by rss_feed_item UUID', () => {
    const timestamp = Date.UTC(2026, 0, 2)
    const rssFeedItemId = '0194f68a-2d69-7db5-99c8-59e66b0f8f70'

    const result = parseRssFeedItemFeedCursor(encodeCursor({ timestamp, id: rssFeedItemId }))

    expect(result).toEqual({
      published_lt: timestamp,
      item_id_lt: rssFeedItemId,
    })
  })

  it('buildRssFeedItemFeedPageInfo omits end_cursor when there is no next page', () => {
    const row = {
      result_id: '0194f68a-2d69-7db5-99c8-59e66b0f8f70',
      cursor_id: '0194f68a-2d69-7db5-99c8-59e66b0f8f70',
      sort_at: new Date('2026-01-02T00:00:00.000Z'),
    }

    const pageInfo = buildRssFeedItemFeedPageInfo([row], false)

    expect(pageInfo.has_next_page).toBe(false)
    expect(pageInfo.start_cursor).toBeTruthy()
    expect(pageInfo.end_cursor).toBeNull()
  })

  it('getCutoffDateForTimeRange derives a UUIDv7 lower bound for bounded ranges', () => {
    const result = getCutoffDateForTimeRange('1w')

    expect(result.cutoffDate).toBeInstanceOf(Date)
    expect(result.itemCutoffId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
  })
})
