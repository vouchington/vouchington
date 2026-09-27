import { describe, expect, it } from 'vitest'
import { encodeCursor, encodeScopedTierPreciseUuidCursor } from '@modules/pagination'
import {
  buildRssFeedItemSearchPageInfo,
  getRssFeedItemSearchCursor,
  getRssFeedItemSearchCursorScope,
} from './search-cursor.mts'

const id = '0194f68a-2d69-7db5-99c8-59e66b0f8f70'
const timestamp = '2020-01-02T03:04:05.123456Z'
const scope = getRssFeedItemSearchCursorScope({})
const after = buildRssFeedItemSearchPageInfo(
  [{ id, cursor_published_at: timestamp }],
  true,
  scope,
).end_cursor!

describe('RSS recency scoped precise cursor', () => {
  it('round trips exact timestamps and rejects legacy shapes', () => {
    expect(getRssFeedItemSearchCursor({ after })).toEqual({ timestamp, id, scope })
    expect(getRssFeedItemSearchCursor({})).toBeNull()
    expect(buildRssFeedItemSearchPageInfo([], false, scope)).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
    expect(
      buildRssFeedItemSearchPageInfo([{ id, cursor_published_at: timestamp }], false, scope),
    ).toEqual({ has_next_page: false, start_cursor: after, end_cursor: null })
    for (const invalid of [
      encodeCursor({ timestamp: Date.parse(timestamp), id }),
      encodeScopedTierPreciseUuidCursor(timestamp, 0, id, scope),
      encodeCursor({ timestamp, id, scope, extra: true }),
      'not-base64!!!',
    ]) {
      expect(() => getRssFeedItemSearchCursor({ after: invalid })).toThrow(/Invalid cursor/)
    }
  })
  it('normalizes equivalent effective filters and excludes page size', () => {
    expect(
      getRssFeedItemSearchCursorScope({
        rss_feed_ids: ['b', 'a', 'a'],
        topic_ids: ['b', 'a'],
        hashtag_topic_ids: ['a', 'a'],
        media_types: ['audio', 'article'],
        text_search_query: ' seed ',
        limit: 1,
        read: true,
      }),
    ).toBe(
      getRssFeedItemSearchCursorScope({
        rss_feed_ids: ['a', 'b'],
        topic_ids: ['a', 'b'],
        hashtag_topic_ids: ['a'],
        media_types: ['article', 'audio'],
        text_search_query: 'seed',
        limit: 100,
      }),
    )
    expect(getRssFeedItemSearchCursorScope({})).toBe(
      getRssFeedItemSearchCursorScope({
        read: false,
        isAdministrator: true,
        semantic_search_query: ' ',
      }),
    )
  })
  it.each([
    { rss_feed_ids: [id] },
    { topic_ids: [id] },
    { category_topic_ids: [id] },
    { hashtag_topic_ids: [id] },
    { hashtag_alias_ids: [id] },
    { media_types: ['audio' as const] },
    { story_id: id },
    { has_related_posts: false },
    { text_search_query: 'different' },
    { currentUserId: id },
  ])('rejects changed filters and viewer %j', changed => {
    expect(() => getRssFeedItemSearchCursor({ after, ...changed })).toThrow(/Invalid cursor/)
  })
  it('binds viewer role and read state', () => {
    const userScope = getRssFeedItemSearchCursorScope({ currentUserId: id })
    const cursor = buildRssFeedItemSearchPageInfo(
      [{ id, cursor_published_at: timestamp }],
      true,
      userScope,
    ).end_cursor!
    expect(() =>
      getRssFeedItemSearchCursor({ currentUserId: id, isAdministrator: true, after: cursor }),
    ).toThrow(/Invalid cursor/)
    expect(() =>
      getRssFeedItemSearchCursor({ currentUserId: id, read: false, after: cursor }),
    ).toThrow(/Invalid cursor/)
  })
})
