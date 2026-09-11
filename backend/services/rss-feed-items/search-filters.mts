import sql, { type SQLStatement } from 'sql-template-strings'
import { decodeUuidCursor, isTimestampCursor } from '@modules/pagination'
import {
  buildPublicPostEligibilityFilter,
  buildViewerPostDiscoveryEligibilityFilter,
} from '@modules/feed-query-builders'
import {
  feedIsEnabledAndDiscoverableSql,
  itemHasDiscoverableSourceSql,
} from '@modules/feed-query-builders/discoverability-sql'
import type { SearchRssFeedItemsOptions } from './search.mts'
import {
  buildCategoryTopicFilter,
  buildFeedOwnerTopicFilter,
  buildHashtagTopicFilter,
} from './search-filter-sql.mts'

function buildHasRelatedPostsFilter(currentUserId?: string, isAdministrator = false): SQLStatement {
  const eligibility = currentUserId
    ? buildViewerPostDiscoveryEligibilityFilter('posts', 'root_post', {
        currentUserId,
        isAdministrator,
      })
    : buildPublicPostEligibilityFilter('posts', 'root_post')
  return sql`(
    EXISTS (
      SELECT 1
      FROM "relation__post__related__url" rel
      JOIN posts ON posts.id = rel.subject_id
      JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
      WHERE rel.object_id = rss_feed_items.url_id
        AND rel.deleted_at IS NULL
        AND rel.votes_score_net > 0
        AND `
    .append(eligibility)
    .append(sql`
    ) OR EXISTS (
      SELECT 1
      FROM posts
      JOIN posts root_post ON root_post.id = COALESCE(posts.root_id, posts.id)
      WHERE posts.post_type = 'link'
        AND posts.url_id = rss_feed_items.url_id
        AND `)
    .append(eligibility).append(sql`
    )
  )`)
}

export function buildRssFeedItemFilters(options: SearchRssFeedItemsOptions): SQLStatement[] {
  const {
    after,
    rss_feed_ids = [],
    topic_ids = [],
    category_topic_ids = [],
    hashtag_topic_ids = [],
    hashtag_alias_ids = [],
    story_id,
    has_related_posts,
    media_types = [],
    text_search_query,
    read,
    currentUserId,
    isAdministrator = false,
  } = options
  const filters: SQLStatement[] = []

  if (text_search_query?.trim()) {
    filters.push(
      sql`rss_feed_items.search_vector @@ websearch_to_tsquery('voucha_english', ${text_search_query.trim()})`,
    )
  }

  if (rss_feed_ids.length > 0) {
    const filter = sql`EXISTS (
      SELECT 1 FROM rss_feed_item_sources rfis
      JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
      WHERE rfis.rss_feed_item_id = rss_feed_items.id
        AND rfis.rss_feed_id = ANY(${rss_feed_ids})
        AND rf.deleted_at IS NULL
        AND `
    filter.append(feedIsEnabledAndDiscoverableSql('rf'))
    filter.append(sql`
    )`)
    filters.push(filter)
  }
  if (topic_ids.length > 0) {
    filters.push(buildFeedOwnerTopicFilter(topic_ids))
  }
  if (category_topic_ids.length > 0) {
    filters.push(buildCategoryTopicFilter(category_topic_ids))
  }
  for (const hashtagTopicId of hashtag_topic_ids) {
    const feedOwner = buildFeedOwnerTopicFilter([hashtagTopicId])
    const category = buildHashtagTopicFilter(hashtagTopicId)
    const union = sql`(`
    union.append(feedOwner)
    union.append(sql` OR `)
    union.append(category)
    union.append(sql`)`)
    filters.push(union)
  }
  for (const aliasId of hashtag_alias_ids) {
    filters.push(sql`EXISTS (
      SELECT 1 FROM relation__rss_feed_item__category__topic_alias relation
      WHERE relation.subject_id = rss_feed_items.id
        AND relation.object_id = ${aliasId}
        AND relation.deleted_at IS NULL
        AND relation.votes_score_net > 0
    )`)
  }

  if (story_id) {
    filters.push(sql`rss_feed_items.story_id = ${story_id}`)
  }

  if (has_related_posts === true) {
    filters.push(buildHasRelatedPostsFilter(currentUserId, isAdministrator))
  } else if (has_related_posts === false) {
    const related = buildHasRelatedPostsFilter(currentUserId, isAdministrator)
    filters.push(sql`NOT `.append(related))
  }

  if (media_types.length > 0) {
    filters.push(sql`rss_feed_items.media_type = ANY(${media_types}::rss_feed_item_media_types[])`)
  }

  if (read !== undefined && currentUserId) {
    if (read) {
      filters.push(
        sql`EXISTS (SELECT 1 FROM rss_feed_item_read_states WHERE user_id = ${currentUserId}::uuid AND rss_feed_item_id = rss_feed_items.id)`,
      )
    } else {
      filters.push(
        sql`NOT EXISTS (SELECT 1 FROM rss_feed_item_read_states WHERE user_id = ${currentUserId}::uuid AND rss_feed_item_id = rss_feed_items.id)`,
      )
    }
  }

  if (after) {
    const cursor = decodeUuidCursor(
      after,
      isTimestampCursor,
      'Invalid cursor format: expected timestamp cursor',
    )

    const published_lt = new Date(cursor.timestamp)
    const itemId = cursor.id

    filters.push(
      sql`(rss_feed_items.published_at, rss_feed_items.id) < (${published_lt}, ${itemId}::uuid)`,
    )
  }

  filters.push(sql`rss_feed_items.deleted_at IS NULL`)
  if (rss_feed_ids.length === 0 && topic_ids.length === 0) {
    filters.push(itemHasDiscoverableSourceSql('rss_feed_items.id'))
  }
  return filters
}

export function appendWhereClauses(query: SQLStatement, filters: SQLStatement[]) {
  if (filters.length === 0) return
  query.append(sql` WHERE `)
  filters.forEach((filter, index) => {
    if (index > 0) query.append(sql` AND `)
    query.append(filter)
  })
}
