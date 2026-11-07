import { areHackerNewsReferencesVisible } from '@services/urls/hacker-news-visibility-config'
import sql, { type SQLStatement } from 'sql-template-strings'
import type { RssFeedItemFeedOptions } from '../../types.mts'
import { appendRelatedPostsFilter } from '../query-utils.mts'
import { appendRssFeedItemHashtagFilters } from './hashtag-filters.mts'
import { buildItemSourceTopicMatch } from './item-membership.mts'
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
    hasHackerNewsReferences,
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
    hasHackerNewsReferences?: boolean
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
      AND COALESCE((SELECT TRUE
        FROM rss_feed_item_sources rfis
        JOIN rss_feeds rf ON rf.id = rfis.rss_feed_id
          AND rf.is_enabled = TRUE AND rf.deleted_at IS NULL
        WHERE rfis.rss_feed_item_id = `)
  query.append(rssFeedItemId).append(buildRssFeedItemSourceMuteFilter()).append(sql`
        LIMIT 1), FALSE)
  `)
  appendRssFeedItemViewerEligibilityFilters(query, rssFeedItemId, rssFeedItemUrlId)
  appendRelatedPostsFilter(
    query,
    hasRelatedPosts,
    currentUserId,
    currentUserIsAdministrator,
    rssFeedItemUrlId,
  )

  if (areHackerNewsReferencesVisible() && hasHackerNewsReferences !== undefined) {
    query.append(hasHackerNewsReferences ? sql` AND ` : sql` AND NOT `)
    query.append(rssFeedItemTable).append(sql`.has_hacker_news_references`)
  }

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
    query
      .append(sql` AND `)
      .append(buildItemSourceTopicMatch(rssFeedItemId, sql`${topicIds}::uuid[]`))
  }
  appendRssFeedItemHashtagFilters(query, {
    aliasIds: hashtagAliasIds,
    hasUnknownHashtag,
    rssFeedItemId,
    topicIds: hashtagTopicIds,
  })
}
