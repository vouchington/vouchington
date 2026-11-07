import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { RssFeedSearchRow, SearchRssFeedsOptions } from './types.mts'
import { mutedPublisherTypeFilter } from './search-publisher-types.mts'

type TrendingOptions = Pick<
  SearchRssFeedsOptions,
  'current_user_id' | 'limit' | 'time_range' | 'cursorScore' | 'cursorId'
>

/**
 * The trending page: reads the ranking window of mv_trending_rss_feeds (window_name, score, id)
 * in index order and hydrates only the page's feeds. The MV holds enabled, discoverable feeds.
 */
export const searchTrendingRssFeeds = async ({
  current_user_id,
  limit = 100,
  time_range = 'week',
  cursorScore,
  cursorId,
}: TrendingOptions) => {
  const query = sql`/* searchRssFeeds */
    WITH rss_feed_ids AS MATERIALIZED (
      SELECT rss_feeds.id, trending.trending_score AS cursor_score
      FROM mv_trending_rss_feeds trending
      JOIN rss_feeds ON rss_feeds.id = trending.id
      WHERE rss_feeds.deleted_at IS NULL
        AND trending.window_name = ${time_range}
        AND rss_feeds.is_enabled = TRUE`
  if (current_user_id) query.append(sql` AND `).append(mutedPublisherTypeFilter(current_user_id))
  if (cursorScore !== undefined && cursorId) {
    query.append(
      sql` AND (trending.trending_score, trending.id) < (${cursorScore}, ${cursorId}::uuid)`,
    )
  }
  query.append(sql`
      ORDER BY trending.trending_score DESC, trending.id DESC
      LIMIT ${limit}
    )

    SELECT view_rss_feeds.*, rss_feed_ids.cursor_score
    FROM rss_feed_ids
    JOIN LATERAL (
      WITH keyed_feed AS MATERIALIZED (
        SELECT * FROM view_rss_feeds WHERE id = rss_feed_ids.id
      )
      SELECT * FROM keyed_feed
    ) view_rss_feeds ON TRUE
    ORDER BY rss_feed_ids.cursor_score DESC, view_rss_feeds.id DESC
  `)
  const { rows } = await read<RssFeedSearchRow>(query)
  return rows
}
