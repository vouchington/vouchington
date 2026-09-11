import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { appendTopicDescendantsCte } from '@services/topics/descendants-sql'
import type { SearchRssFeedsOptions } from './types.mts'
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
    enabled = true,
    discoverable = null,
    text_search_query,
    limit = 100,
    feed_type,
    category_topic_id,
    cursorId,
  } = options

  const filters: ReturnType<typeof sql>[] = [sql`rss_feeds.deleted_at IS NULL`]
  let sortBy = sql`rss_feeds.id DESC`
  const shouldJoinCurrentState = enabled !== null || discoverable !== null
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
        SELECT COUNT(DISTINCT topic_descendants.root_id)
        FROM topic_descendants
        WHERE topic_descendants.topic_id = rss_feeds.topic_id
      ) = ${effectiveTopicIds.length}`)
    } else {
      filters.push(sql`EXISTS (
        SELECT 1
        FROM topic_descendants
        WHERE topic_descendants.topic_id = rss_feeds.topic_id
      )`)
    }
  }

  for (const hashtagTopicId of new Set(hashtag_topic_ids)) {
    filters.push(sql`rss_feeds.topic_id = ${hashtagTopicId}`)
  }

  if (effectivePublisherTypeIds.length > 0) {
    if (publisher_type_match === 'all' && effectivePublisherTypeIds.length > 1) {
      filters.push(sql`FALSE`)
    } else {
      filters.push(sql`(
        SELECT relation.object_id
        FROM relation__topic__publisher_type__topic relation
        JOIN topics publisher_type ON publisher_type.id = relation.object_id
        WHERE relation.subject_id = rss_feeds.topic_id
          AND relation.deleted_at IS NULL
          AND relation.votes_score_net > 0
          AND publisher_type.deleted_at IS NULL
        ORDER BY relation.votes_score_net DESC NULLS LAST, relation.id ASC
        LIMIT 1
      ) = ANY(${effectivePublisherTypeIds})`)
    }
  }

  if (current_user_id) {
    filters.push(sql`NOT EXISTS (
      SELECT 1
      FROM relation__user__mute__topic mute
      WHERE mute.subject_id = ${current_user_id}
        AND mute.deleted_at IS NULL
        AND mute.object_id = (
          SELECT relation.object_id
          FROM relation__topic__publisher_type__topic relation
          JOIN topics publisher_type ON publisher_type.id = relation.object_id
          WHERE relation.subject_id = rss_feeds.topic_id
            AND relation.deleted_at IS NULL
            AND relation.votes_score_net > 0
            AND publisher_type.deleted_at IS NULL
          ORDER BY relation.votes_score_net DESC NULLS LAST, relation.id ASC
          LIMIT 1
        )
    )`)
  }

  if (feed_type) filters.push(sql`rss_feeds.feed_type = ${feed_type}`)
  if (category_topic_id) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM rss_feed_categories rfc
      WHERE rfc.rss_feed_id = rss_feeds.id AND rfc.topic_id = ${category_topic_id}
    )`)
  }
  if (cursorId) filters.push(sql`rss_feeds.id < ${cursorId}::uuid`)
  // enabled/discoverable === null means no filter
  if (enabled === true) {
    filters.push(sql`current_state.is_enabled = TRUE`)
  } else if (enabled === false) {
    filters.push(sql`current_state.is_enabled = FALSE`)
  }
  if (discoverable === true) {
    filters.push(sql`current_state.is_discoverable = TRUE`)
  } else if (discoverable === false) {
    filters.push(sql`current_state.is_discoverable = FALSE`)
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
      OR LOWER(rss_feeds.title) LIKE LOWER(${`%${searchQuery}%`})
    )`)
    sortBy = sql`ts_rank(rss_feeds.search_vector, search_tsquery.tsquery) DESC, rss_feeds.id DESC`

    query.append(sql`
      search_tsquery AS (
        SELECT websearch_to_tsquery('voucha_english', ${searchQuery}) AS tsquery
      ),
      rss_feed_ids AS (
        SELECT id
        FROM rss_feeds
        CROSS JOIN search_tsquery
    `)
  } else {
    query.append(sql`
      rss_feed_ids AS (
        SELECT id
        FROM rss_feeds
    `)
  }

  if (shouldJoinCurrentState) {
    query.append(sql`
        JOIN view_rss_feed_current_states current_state
          ON current_state.rss_feed_id = rss_feeds.id`)
  }

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
    JOIN view_rss_feeds
      ON view_rss_feeds.id = rss_feed_ids.id
  `)

  // Browse path: outer ORDER BY for deterministic end_cursor (join doesn't preserve CTE order).
  if (!hasTextSearch) query.append(sql` ORDER BY view_rss_feeds.id DESC`)

  const { rows } = await read(query)
  return rows
}
