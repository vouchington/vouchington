import type { AnalyzeOptions } from '@vouchington/explain-plan'

/** Relations whose sequential scans the EXPLAIN gates report, by parent name. */
const LARGE_TABLES = new Set([
  'posts',
  'users',
  'topics',
  'rss_feeds',
  'rss_feed_items',
  'rss_feed_item_categories',
  'relation__user__follow__user',
  'relation__user__follow__rss_feed',
  'relation__user__follow__topic',
  'relation__user__mute__user',
  'relation__user__block__user',
  'relation__post__category__topic',
  'crawls',
  'crawl_chunks',
  'post_votes',
  'topic_votes',
  'notifications',
  'community_post_reviews',
  'topic_aliases',
  'post_data_point_topics',
  'post_review_topic_ratings',
])

export function parentRelationName(relationName: string): string {
  return relationName.replace(/__(?:default|p_\w+)$/, '')
}

export const PLAN_ANALYSIS_OPTIONS: AnalyzeOptions = {
  largeTables: LARGE_TABLES,
  resolveRelation: parentRelationName,
}
