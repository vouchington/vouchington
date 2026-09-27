import { describe, expect, it } from 'vitest'
import {
  encodeCursor,
  encodeScopedTierPreciseUuidCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
import {
  buildRssFeedItemFeedPageInfo,
  getRssFeedItemFeedCursorScope,
  parseRssFeedItemFeedCursor,
} from './cursor.mts'

const id = '0194f68a-2d69-7db5-99c8-59e66b0f8f70'
const timestamp = '2020-01-02T03:04:05.123456Z'
const options = {
  feed_type: 'any' as const,
  time_range: '1w' as const,
  min_score_follow_rss_feeds: -5,
  min_score_follow_topics: 0,
  isAdministrator: false,
}
const scope = getRssFeedItemFeedCursorScope(id, options)

describe('RSS feed scoped precise cursor', () => {
  it.each([0, 1] as const)('round trips delivery tier %s with exact timestamps', tier => {
    const row = { cursor_sort_at: timestamp, sort_rank: tier, cursor_id: id }
    const info = buildRssFeedItemFeedPageInfo([row], true, scope)
    expect(parseRssFeedItemFeedCursor(info.end_cursor!, scope)).toEqual({
      published_lt: timestamp,
      [tier ? 'share_event_id_lt' : 'item_id_lt']: id,
    })
    expect(info.start_cursor).toBe(info.end_cursor)
    expect(buildRssFeedItemFeedPageInfo([row], false, scope).end_cursor).toBeNull()
    expect(buildRssFeedItemFeedPageInfo([], false, scope)).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
    expect(parseRssFeedItemFeedCursor(undefined, scope)).toEqual({})
  })
  it.each([
    encodeCursor({ timestamp: Date.parse(timestamp), id }),
    encodeCursor({ timestamp, tier: 1, id: `share:${id}`, scope }),
    encodeScopedTierPreciseUuidCursor(timestamp, 2, id, scope),
    encodeScopedTierPreciseUuidCursor(timestamp, 0, id, 'another-resource'),
    encodeScopedPreciseTimestampCursor(timestamp, id, scope),
    encodeCursor({ timestamp: '2020-01-02T03:04:05.123Z', tier: 0, id, scope }),
    'not-base64!!!',
  ])('rejects invalid or replayed cursor %s', after => {
    expect(() => parseRssFeedItemFeedCursor(after, scope)).toThrow(/Invalid cursor/)
  })
  it('normalizes equivalent effective filters and excludes page size', () => {
    expect(
      getRssFeedItemFeedCursorScope(id, {
        ...options,
        limit: 1,
        topic_ids: ['b', 'a', 'a'],
        text_search_query: ' seed ',
      }),
    ).toBe(
      getRssFeedItemFeedCursorScope(id, {
        ...options,
        limit: 100,
        after: 'ignored',
        topic_ids: ['a', 'b'],
        text_search_query: 'seed',
        has_unknown_hashtag: false,
        media_types: [],
      }),
    )
  })
  it.each([
    { isAdministrator: true },
    { community_id: id },
    { feed_type: 'all' as const },
    { time_range: 'all' as const },
    { min_score_follow_rss_feeds: 0 },
    { min_score_follow_topics: 1 },
    { has_related_posts: false },
    { media_types: ['audio' as const] },
    { topic_ids: [id] },
    { hashtag_topic_ids: [id] },
    { hashtag_alias_ids: [id] },
    { text_search_query: 'different' },
    { has_unknown_hashtag: true },
  ])('binds effective access and filters %j', changed => {
    expect(() =>
      parseRssFeedItemFeedCursor(
        encodeScopedTierPreciseUuidCursor(timestamp, 0, id, scope),
        getRssFeedItemFeedCursorScope(id, { ...options, ...changed }),
      ),
    ).toThrow(/Invalid cursor/)
  })
  it('binds the viewer', () => {
    expect(getRssFeedItemFeedCursorScope(undefined, options)).not.toBe(scope)
  })
})
