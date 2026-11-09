import { rssFeedItem, user } from './data.mts'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { getRssFeedItemFeedCursorScope } from '../../services/feeds/rss-feed-items/cursor.mts'
import type { ApiFixtureCase } from './types.mts'

// Illustrative decision instant: 2026-11-08T00:00:00Z. The selected items are within its week.
// An older candidate is
// intentionally absent: 1m, 1y and all are capped by the producer to the seven-day horizon.
const sourceOnlyId = '70000000-0000-7000-8000-000000005461'
const topicOnlyId = '70000000-0000-7000-8000-000000005462'
const bothId = '70000000-0000-7000-8000-000000005463'
const recentAt = '2026-11-07T12:00:00.000Z'
const weekAt = '2026-11-05T12:00:00.000Z'
const oldestIncludedAt = '2026-11-02T12:00:00.000Z'
const ids = [sourceOnlyId, topicOnlyId, bothId]
const timestamps = [recentAt, weekAt, oldestIncludedAt]
const followedSource = {
  ...rssFeedItem.rss_feed,
  id: 'feed-followed-source',
  topic: { ...rssFeedItem.rss_feed.topic, id: 'topic-other', slug: 'other' },
}
const otherSource = { ...followedSource, id: 'feed-other-source' }
function cursorFor(time_range: '1d' | '1m' | '1y' | 'all', id: string) {
  const scope = getRssFeedItemFeedCursorScope(user.id, {
    feed_type: 'all',
    time_range,
    min_score_follow_rss_feeds: -5,
    min_score_follow_topics: 0,
    isAdministrator: false,
  })
  const preciseTimestamp = timestamps[ids.indexOf(id)]!.replace('.000Z', '.000000Z')
  return encodeScopedPreciseTimestampCursor(preciseTimestamp, id, scope)
}
const firstPageCursor = cursorFor('all', topicOnlyId)
const entities = Object.fromEntries(
  ids.map((id, index) => [
    id,
    {
      ...rssFeedItem,
      id,
      guid: id,
      published_at: timestamps[index],
      rss_feed: id === topicOnlyId ? otherSource : followedSource,
      categories: id === sourceOnlyId ? [] : rssFeedItem.categories,
      data: {
        ...rssFeedItem.data,
        guid: id,
        title: ['Source follow', 'Topic follow', 'Both follows'][index],
      },
    },
  ]),
)
function body(selectedIds: string[], time_range: '1d' | '1m' | '1y' | 'all', hasNextPage: boolean) {
  return {
    results: selectedIds.map(id => ({
      __entity_type: 'rss_feed_item',
      id,
      entity_id: id,
      published_at: timestamps[ids.indexOf(id)],
      story_id: null,
      delivery_type: 'direct',
    })),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: selectedIds.length ? cursorFor(time_range, selectedIds[0]!) : null,
      end_cursor: hasNextPage ? cursorFor(time_range, selectedIds.at(-1)!) : null,
    },
    rss_feed_items: Object.fromEntries(selectedIds.map(id => [id, entities[id]])),
    rss_feed_item_thumbnail_url: {},
    rss_feed_item_embeds: {},
    rss_feed_item_hacker_news_references: {},
    rss_feed_item_elections: {},
    stories: {},
    story_member_pages: {},
    story_post_ids: {},
    users: {},
    related_posts_by_url_id: {},
    posts: {},
    posts_metrics: {},
    rss_feed_bookmarks: {},
  }
}
const common: Pick<
  ApiFixtureCase,
  'method' | 'path' | 'route' | 'auth' | 'status' | 'consumers' | 'migratedFrom'
> = {
  method: 'GET',
  path: '/api/v1/feeds/rss_feed_items/all',
  route: {
    routeTemplate: '/api/v1/feeds/rss_feed_items/:feed_type',
    pathParams: { feed_type: 'all' },
  },
  auth: 'fixture-user',
  status: 200,
  consumers: ['swift-core', 'swift-ui', 'dotnet-core'],
  migratedFrom: [
    'backend/services/feeds/rss-feed-items/__tests__/get-ids.weekly-walk.test.mts',
    'backend/services/feeds/rss-feed-items/__tests__/get-ids.empty-no-follows.generated.test.mts',
  ],
}
export const nativePersonalRssWindowApiFixtureCases: ApiFixtureCase[] = [
  ...(['1m', '1y', 'all'] as const).map(time_range => ({
    ...common,
    id: `native.rss-personal.seven-day.${time_range}`,
    query: { time_range, limit: '25' },
    body: body(ids, time_range, false),
  })),
  {
    ...common,
    id: 'native.rss-personal.one-day',
    query: { time_range: '1d', limit: '25' },
    body: body([sourceOnlyId], '1d', false),
  },
  {
    ...common,
    id: 'native.rss-personal.union.first-page',
    query: { time_range: 'all', limit: '2' },
    body: body([sourceOnlyId, topicOnlyId], 'all', true),
  },
  {
    ...common,
    id: 'native.rss-personal.union.next-page',
    query: { time_range: 'all', limit: '2', after: firstPageCursor },
    body: body([bothId], 'all', false),
  },
]
