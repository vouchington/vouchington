export type RssFeedItemCategoriesJobs =
  | 'processReconcileRssFeedItemCategorySnapshots'
  | 'processBackfillCategoriesForTopicAliases'
  | 'processBackfillRssFeedCategoriesForTopicAlias'

export type RssFeedDiscoverabilityJobs = 'processEvaluateRssFeedDiscoverability'

export type TopicAliasJobs =
  | 'processTopicAliasesUpdate'
  | 'processInvalidatePostsForTopicAliases'
  | 'processReconcileTopicAliasCategoryMappings'
