import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedOptions } from '../../types.mts'
import { appendRelatedPostsFilter } from '../query-utils.mts'
import { appendRssFeedItemHashtagFilters } from './hashtag-filters.mts'
import {
  buildRssFeedItemSourceMuteFilter,
  appendRssFeedItemViewerEligibilityFilters,
} from './viewer-eligibility.mts'

export function appendRssFeedItemEligibilityFilters(
  query: SQLStatement,
  {
    currentUserId,
    currentUserIsAdministrator,
    hasRelatedPosts,
    mediaTypes,
    textSearchQuery,
    topicIds,
    hashtagTopicIds,
    hashtagAliasIds,
    hasUnknownHashtag,
    rssFeedItemId = sql`rss_feed_items.id`,
    rssFeedItemUrlId = sql`rss_feed_items.url_id`,
    rssFeedItemTable = sql`rss_feed_items`,
  }: {
    currentUserId?: string
    currentUserIsAdministrator: boolean
    hasRelatedPosts: boolean | undefined
    mediaTypes: string[]
    textSearchQuery: RssFeedItemFeedOptions['text_search_query']
    topicIds: RssFeedItemFeedOptions['topic_ids']
    hashtagTopicIds: RssFeedItemFeedOptions['hashtag_topic_ids']
    hashtagAliasIds: RssFeedItemFeedOptions['hashtag_alias_ids']
    hasUnknownHashtag: RssFeedItemFeedOptions['has_unknown_hashtag']
    rssFeedItemId?: SQLStatement
    rssFeedItemUrlId?: SQLStatement
    rssFeedItemTable?: SQLStatement
  },
): void {
  query
    .append(sql`
      `)
    .append(rssFeedItemTable).append(sql`.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM rss_feed_item_sources rfis
        JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
          AND rf.is_enabled = TRUE
          AND rf.deleted_at IS NULL
        WHERE rfis.rss_feed_item_id = `)
  query
    .append(rssFeedItemId)
    .append(sql`
  `)
    .append(buildRssFeedItemSourceMuteFilter()).append(sql`)
  `)
  appendRssFeedItemViewerEligibilityFilters(query, rssFeedItemId, rssFeedItemUrlId)
  appendRelatedPostsFilter(
    query,
    hasRelatedPosts,
    currentUserId,
    currentUserIsAdministrator,
    rssFeedItemUrlId,
  )

  if (mediaTypes.length > 0) {
    query
      .append(sql`
      AND `)
      .append(rssFeedItemTable)
      .append(sql`.media_type = ANY(${mediaTypes}::rss_feed_item_media_types[])
    `)
  }
  if (textSearchQuery?.trim()) {
    query
      .append(sql`
      AND `)
      .append(rssFeedItemTable)
      .append(sql`.search_vector @@ websearch_to_tsquery('voucha_english', ${textSearchQuery.trim()})
    `)
  }
  if (topicIds?.length) {
    query.append(sql`
      AND EXISTS (
        SELECT 1
        FROM rss_feed_item_sources topic_rfis
        JOIN rss_feeds topic_rf ON topic_rf.id = topic_rfis.rss_feed_id
        WHERE topic_rfis.rss_feed_item_id = `)
    query.append(rssFeedItemId).append(sql`
          AND topic_rf.topic_id = ANY(${topicIds}::uuid[])
          AND topic_rf.is_enabled = TRUE
          AND topic_rf.deleted_at IS NULL
      )
    `)
  }
  appendRssFeedItemHashtagFilters(query, {
    aliasIds: hashtagAliasIds,
    hasUnknownHashtag,
    rssFeedItemId,
    topicIds: hashtagTopicIds,
  })
}
