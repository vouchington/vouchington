import { escapeLikePattern } from '@modules/search-utils'
import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendTopicDescendantsCte } from '@services/topics/descendants-sql'
import type { RssFeedSearchRow, SearchRssFeedsOptions } from './types.mts'
import { mutedPublisherTypeFilter, publisherTypeFilter } from './search-publisher-types.mts'
import { feedStateFilters } from './search-state-filters.mts'
import { searchTrendingRssFeeds } from './search-trending.mts'
export type { SearchRssFeedsOptions }

export const searchRssFeeds = async (options: SearchRssFeedsOptions = {}) => {
  const {
    topic_id,
    topic_ids = [],
    hashtag_topic_ids = [],
    topic_match = 'any',
    include_descendants = false,
    publisher_type_id,
    publisher_type_ids = [],
    publisher_type_match = 'any',
    current_user_id,
    is_enabled = true,
    discoverable = null,
    text_search_query,
    limit = 100,
    feed_type,
    category_topic_id,
    cursorId,
    sort,
    time_range,
    cursorScore,
  } = options
  if (sort === 'trending') {
    return searchTrendingRssFeeds({ current_user_id, limit, time_range, cursorScore, cursorId })
  }

  const filters: ReturnType<typeof sql>[] = [sql`rss_feeds.deleted_at IS NULL`]
  let sortBy = sql`rss_feeds.id DESC`
  const effectiveTopicIds = Array.from(new Set([...(topic_id ? [topic_id] : []), ...topic_ids]))
  const effectiveTopicMatch = topic_id && effectiveTopicIds.length > 1 ? 'all' : topic_match
  const effectivePublisherTypeIds = Array.from(
    new Set(publisher_type_id ? [publisher_type_id] : publisher_type_ids),
  )

  if (effectiveTopicIds.length > 0 && !include_descendants) {
    if (effectiveTopicIds.length === 1) {
      filters.push(sql`rss_feeds.topic_id = ${effectiveTopicIds[0]}`)
    } else if (effectiveTopicMatch === 'all') {
      filters.push(sql`FALSE`)
    } else {
      filters.push(sql`rss_feeds.topic_id = ANY(${effectiveTopicIds})`)
    }
  }

  if (effectiveTopicIds.length > 0 && include_descendants) {
    if (effectiveTopicMatch === 'all' && effectiveTopicIds.length > 1) {
      filters.push(sql`(
        SELECT COUNT(DISTINCT topic_descendants.root_post_id)
        FROM topic_descendants
        WHERE topic_descendants.topic_id = rss_feeds.topic_id
      ) = ${effectiveTopicIds.length}`)
    } else {
      const descendants = sql`EXISTS (
        SELECT 1 FROM topic_descendants
        WHERE topic_descendants.topic_id = rss_feeds.topic_id
          AND topic_descendants.root_post_id IN (`
      effectiveTopicIds.forEach((id, index) => {
        if (index > 0) descendants.append(sql`, `)
        descendants.append(sql`${id}::uuid`)
      })
      filters.push(descendants.append(sql`))`))
    }
  }

  for (const hashtagTopicId of new Set(hashtag_topic_ids)) {
    filters.push(sql`rss_feeds.topic_id = ${hashtagTopicId}`)
  }

  if (effectivePublisherTypeIds.length > 0) {
    if (publisher_type_match === 'all' && effectivePublisherTypeIds.length > 1) {
      filters.push(sql`FALSE`)
    } else {
      filters.push(publisherTypeFilter(effectivePublisherTypeIds))
    }
  }

  if (current_user_id) {
    filters.push(mutedPublisherTypeFilter(current_user_id))
  }

  if (feed_type) filters.push(sql`rss_feeds.feed_type = ${feed_type}`)
  if (category_topic_id) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM rss_feed_categories rfc
      WHERE rfc.rss_feed_id = rss_feeds.id AND rfc.topic_id = ${category_topic_id}
    )`)
  }
  if (cursorId) filters.push(sql`rss_feeds.id < ${cursorId}::uuid`)
  filters.push(...feedStateFilters(is_enabled, discoverable))

  const hasTextSearch = text_search_query && typeof text_search_query === 'string'
  const shouldIncludeTopicDescendants = include_descendants && effectiveTopicIds.length > 0

  const query = sql`/* searchRssFeeds */
    `
  query.append(hasTextSearch || shouldIncludeTopicDescendants ? sql`WITH RECURSIVE ` : sql`WITH `)
  if (shouldIncludeTopicDescendants) {
    // Keep input arity and root-key scope visible in both custom and generic plans.
    appendTopicDescendantsCte(query, effectiveTopicIds, { bindRootIdsIndividually: true })
  }

  if (hasTextSearch) {
    // Use CTE to compute tsquery once and reuse it
    filters.push(sql`(
      rss_feeds.search_vector @@ search_tsquery.tsquery
      OR LOWER(rss_feeds.title) LIKE search_tsquery.title_pattern ESCAPE '\\'
    )`)
    sortBy = sql`ts_rank(rss_feeds.search_vector, search_tsquery.tsquery) DESC, rss_feeds.id DESC`

    query.append(sql`
      search_tsquery AS MATERIALIZED (
        SELECT websearch_to_tsquery('voucha_english', ${text_search_query}) AS tsquery,
          LOWER(${`%${escapeLikePattern(text_search_query)}%`}) AS title_pattern
      ),
      rss_feed_ids AS MATERIALIZED (
        SELECT id
    `)
  } else {
    query.append(sql`
      rss_feed_ids AS MATERIALIZED (
        SELECT `)
    query.append(sql`id`)
  }
  query.append(sql` FROM rss_feeds`)
  if (hasTextSearch) query.append(sql` CROSS JOIN search_tsquery`)

  if (filters.length > 0) {
    query.append(sql` WHERE `)
    filters.forEach((filter, index) => {
      if (index > 0) query.append(sql` AND `)
      query.append(filter)
    })
  }

  query.append(sql`
      ORDER BY `)
  query.append(sortBy)
  query.append(sql`
      LIMIT ${limit}
    )

    SELECT
      view_rss_feeds.*`)
  query.append(sql`
    FROM rss_feed_ids
    JOIN LATERAL (
      WITH keyed_feed AS MATERIALIZED (
        SELECT * FROM view_rss_feeds WHERE id = rss_feed_ids.id
      )
      SELECT * FROM keyed_feed
    ) view_rss_feeds ON TRUE
  `)

  // Browse path: outer ORDER BY for deterministic end_cursor (join doesn't preserve CTE order).
  if (!hasTextSearch) query.append(sql` ORDER BY view_rss_feeds.id DESC`)

  const { rows } = await read<RssFeedSearchRow>(query)
  return rows
}
