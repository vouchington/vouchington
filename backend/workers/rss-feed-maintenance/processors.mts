import type { Job } from 'glide-mq'
import * as itemCategories from './processors/item-categories.mts'
import * as topicAliases from './processors/topic-aliases.mts'
import * as hardDelete from './processors/hard-delete.mts'
import { processEvaluateRssFeedDiscoverability } from './processors/discoverability.mts'
import { processRecoverRssFeedHardDeletes } from '@services/rss-feeds/hard-delete-recovery'

export function processRssFeedMaintenanceJob(job: Job) {
  switch (job.name) {
    case 'processHardDeleteRssFeedSourcePage':
      return hardDelete.processHardDeleteRssFeedSourcePage(job.data as { rssFeedId: string })
    case 'processHardDeleteRssFeedChildPage':
      return hardDelete.processHardDeleteRssFeedChildPage(
        job.data as {
          rssFeedId: string
          phase: import('@queues/rss-feed-maintenance/types').RssFeedHardDeleteChildPhase
        },
      )
    case 'processFinalizeHardDeleteRssFeed':
      return hardDelete.processFinalizeHardDeleteRssFeed(job.data as { rssFeedId: string })
    case 'processRecoverRssFeedHardDeletes':
      return processRecoverRssFeedHardDeletes(job.data as { afterId: string | null })
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
