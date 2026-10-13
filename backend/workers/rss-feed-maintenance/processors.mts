import type { Job } from 'glide-mq'
import * as itemCategories from './processors/item-categories.mts'
import * as topicAliases from './processors/topic-aliases.mts'
import { processEvaluateRssFeedDiscoverability } from './processors/discoverability.mts'

export function processRssFeedMaintenanceJob(job: Job) {
  switch (job.name) {
    case 'processReconcileRssFeedItemCategorySnapshots':
    case 'processBackfillCategoriesForTopicAliases':
    case 'processBackfillRssFeedCategoriesForTopicAlias': {
      if (!job.data) throw new Error('RSS Feed Item Categories job .data is required')
      return itemCategories[job.name](job.data as never)
    }
    case 'processEvaluateRssFeedDiscoverability':
      return processEvaluateRssFeedDiscoverability(job.data as { rssFeedId?: unknown })
    case 'processTopicAliasesUpdate':
    case 'processInvalidatePostsForTopicAliases':
    case 'processReconcileTopicAliasCategoryMappings': {
      if (!job.data) throw new Error('Topic alias job .data is required')
      return topicAliases[job.name](job.data as never)
    }
    default:
      throw new Error(`RSS feed maintenance job ${job.name} not found`)
  }
}
