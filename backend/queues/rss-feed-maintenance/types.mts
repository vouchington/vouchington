export type RssFeedItemCategoriesJobs =
  | 'processReconcileRssFeedItemCategorySnapshots'
  | 'processBackfillCategoriesForTopicAliases'
  | 'processBackfillRssFeedCategoriesForTopicAlias'

export type RssFeedDiscoverabilityJobs = 'processEvaluateRssFeedDiscoverability'

export type RssFeedHardDeleteJobs =
  | 'processHardDeleteRssFeedSourcePage'
  | 'processHardDeleteRssFeedChildPage'
  | 'processFinalizeHardDeleteRssFeed'
  | 'processRecoverRssFeedHardDeletes'

export const RSS_FEED_HARD_DELETE_CHILD_PHASES = [
  'setting_changes',
  'crawls',
  'community_list_feeds',
  'curated_asides',
  'user_import_requests',
  'feed_categories',
  'canonical_redirects',
  'user_import_rows',
] as const
export type RssFeedHardDeleteChildPhase = (typeof RSS_FEED_HARD_DELETE_CHILD_PHASES)[number]

export type TopicAliasJobs =
  | 'processTopicAliasesUpdate'
  | 'processInvalidatePostsForTopicAliases'
  | 'processReconcileTopicAliasCategoryMappings'

/** First remaining raw row, revalidated under the feed lock before a destructive page. */
export type RssFeedHardDeletePageData = { rssFeedId: string; pageCursor: string }
