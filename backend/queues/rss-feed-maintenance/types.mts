export type RssFeedItemCategoriesJobs = Extract<
  keyof RssFeedMaintenanceJobPayloads,
  | 'processReconcileRssFeedItemCategorySnapshots'
  | 'processBackfillCategoriesForTopicAliases'
  | 'processBackfillRssFeedCategoriesForTopicAlias'
>

export type TopicTextCategoryCursor = {
  phase: 0 | 1 | 2
  name: string
  slug: string
  scanUpperId: string
  afterId: string | null
}

export type TopicTextCategoryJob = {
  topicId: string
  cursor?: TopicTextCategoryCursor | null
}

export type RssFeedDiscoverabilityJobs = Extract<
  keyof RssFeedMaintenanceJobPayloads,
  'processEvaluateRssFeedDiscoverability'
>

export type RssFeedHardDeleteJobs = Extract<
  keyof RssFeedMaintenanceJobPayloads,
  | 'processHardDeleteRssFeedSourcePage'
  | 'processHardDeleteRssFeedChildPage'
  | 'processFinalizeHardDeleteRssFeed'
  | 'processRecoverRssFeedHardDeletes'
>

const RSS_FEED_HARD_DELETE_CHILD_PHASES = [
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

export type TopicAliasJobs = Extract<
  keyof RssFeedMaintenanceJobPayloads,
  | 'processTopicAliasesUpdate'
  | 'processInvalidatePostsForTopicAliases'
  | 'processReconcileTopicAliasCategoryMappings'
  | 'processUnlinkTopicAliasPage'
  | 'processRecoverTopicAliasUnlinks'
>

/** First remaining raw row, revalidated under the feed lock before a destructive page. */
export type RssFeedHardDeletePageData = { rssFeedId: string; pageCursor: string }

export type TopicAliasPostInvalidationData = {
  topicAliasIds: string[]
  changeId: string
  afterPostId?: string
}

export const TOPIC_ALIAS_UNLINK_PHASES = [
  'post_sources',
  'post_relations',
  'rss_item_categories',
  'rss_item_relations',
  'finalize',
] as const

export type TopicAliasUnlinkPhase = (typeof TOPIC_ALIAS_UNLINK_PHASES)[number]

export type TopicAliasUnlinkPage = {
  topicAliasId: string
  phase: TopicAliasUnlinkPhase
  pageCursor: string
}

export type TopicAliasUnlinkRecovery = {
  afterId: string | null
}

export type RssFeedMaintenanceJobPayloads = {
  processHardDeleteRssFeedSourcePage: RssFeedHardDeletePageData
  processHardDeleteRssFeedChildPage: RssFeedHardDeletePageData & {
    phase: RssFeedHardDeleteChildPhase
  }
  processFinalizeHardDeleteRssFeed: RssFeedHardDeletePageData
  processRecoverRssFeedHardDeletes: { afterId: string | null }
  processReconcileRssFeedItemCategorySnapshots: { rssFeedItemIds?: string[] }
  processBackfillCategoriesForTopicAliases: TopicTextCategoryJob
  processBackfillRssFeedCategoriesForTopicAlias: TopicTextCategoryJob
  processEvaluateRssFeedDiscoverability: { rssFeedId: string }
  processTopicAliasesUpdate: { topicId: string; removedTopicAliasId?: string }
  processInvalidatePostsForTopicAliases: TopicAliasPostInvalidationData
  processReconcileTopicAliasCategoryMappings: { topicAliasIds?: string[] }
  processUnlinkTopicAliasPage: TopicAliasUnlinkPage
  processRecoverTopicAliasUnlinks: TopicAliasUnlinkRecovery
}
