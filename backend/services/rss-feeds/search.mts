import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendTopicDescendantsCte } from '@services/topics/descendants-sql'
import type { SearchRssFeedsOptions, ViewRssFeed } from './types.mts'
import { mutedPublisherTypeFilter, publisherTypeCandidateJoin } from './search-publisher-types.mts'
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
  } = options

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

  const joinTopicDescendants =
    effectiveTopicIds.length > 0 &&
    include_descendants &&
    !(effectiveTopicMatch === 'all' && effectiveTopicIds.length > 1)
  if (effectiveTopicIds.length > 0 && include_descendants) {
    if (effectiveTopicMatch === 'all' && effectiveTopicIds.length > 1) {
      filters.push(sql`(
        SELECT COUNT(DISTINCT topic_descendants.root_post_id)
        FROM topic_descendants
        WHERE topic_descendants.topic_id = rss_feeds.topic_id
      ) = ${effectiveTopicIds.length}`)
    }
  }

  for (const hashtagTopicId of new Set(hashtag_topic_ids)) {
    filters.push(sql`rss_feeds.topic_id = ${hashtagTopicId}`)
  }

  let joinPublisherTypes = false
  if (effectivePublisherTypeIds.length > 0) {
    if (publisher_type_match === 'all' && effectivePublisherTypeIds.length > 1) {
      filters.push(sql`FALSE`)
    } else {
      joinPublisherTypes = true
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
  // is_enabled/discoverable === null means no filter
  if (is_enabled === true) {
    filters.push(sql`rss_feeds.is_enabled = TRUE`)
  } else if (is_enabled === false) {
    filters.push(sql`rss_feeds.is_enabled = FALSE`)
  }
  if (discoverable === true) {
    filters.push(sql`rss_feeds.is_discoverable = TRUE`)
  } else if (discoverable === false) {
    filters.push(sql`rss_feeds.is_discoverable = FALSE`)
  }

  const hasTextSearch = text_search_query && typeof text_search_query === 'string'
  const searchQuery = hasTextSearch ? text_search_query : null
  const shouldIncludeTopicDescendants = include_descendants && effectiveTopicIds.length > 0

  const query = sql`/* searchRssFeeds */
    `
  query.append(hasTextSearch || shouldIncludeTopicDescendants ? sql`WITH RECURSIVE ` : sql`WITH `)
  if (shouldIncludeTopicDescendants) {
    appendTopicDescendantsCte(query, effectiveTopicIds)
  }

  if (hasTextSearch) {
    // Use CTE to compute tsquery once and reuse it
    filters.push(sql`(
      rss_feeds.search_vector @@ search_tsquery.tsquery
      OR LOWER(rss_feeds.title) LIKE search_tsquery.title_pattern
    )`)
    sortBy = sql`ts_rank(rss_feeds.search_vector, search_tsquery.tsquery) DESC, rss_feeds.id DESC`

    query.append(sql`
      search_tsquery AS MATERIALIZED (
        SELECT websearch_to_tsquery('voucha_english', ${searchQuery}) AS tsquery,
          LOWER(${`%${searchQuery}%`}) AS title_pattern
      ),
      rss_feed_ids AS MATERIALIZED (
        SELECT id
    `)
  } else {
    query.append(sql`
      rss_feed_ids AS MATERIALIZED (
        SELECT id
    `)
  }
  if (joinTopicDescendants) {
    // Active topic_id is unique, so each descendant contributes at most one feed.
    query.append(sql` FROM (SELECT DISTINCT topic_id FROM topic_descendants) selected_topics
      JOIN LATERAL (
        SELECT * FROM rss_feeds feed
        WHERE feed.topic_id = selected_topics.topic_id AND feed.deleted_at IS NULL
        LIMIT 1
      ) rss_feeds ON TRUE`)
  } else {
    query.append(sql` FROM rss_feeds`)
  }
  if (hasTextSearch) query.append(sql` CROSS JOIN search_tsquery`)
  if (joinPublisherTypes) query.append(publisherTypeCandidateJoin(effectivePublisherTypeIds))

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
      view_rss_feeds.*
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

  const { rows } = await read<ViewRssFeed>(query)
  return rows
}
