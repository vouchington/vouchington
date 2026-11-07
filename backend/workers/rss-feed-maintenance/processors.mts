import type { NamedQueueJob } from '@data-stores/valkey-glide-mq'
import type { RssFeedMaintenanceJobPayloads } from '@queues/rss-feed-maintenance/types'
import {
  applyTopicAliasUnlinkPage,
  recoverTopicAliasUnlinks,
} from '@services/topics/unlink-topic-alias-page'
import * as itemCategories from './processors/item-categories.mts'
import * as topicAliases from './processors/topic-aliases.mts'
import * as hardDelete from './processors/hard-delete.mts'
import { processEvaluateRssFeedDiscoverability } from './processors/discoverability.mts'
import { processRecoverRssFeedHardDeletes } from '@services/rss-feeds/hard-delete-recovery'
import { clearTopicAliasUnlinkCategoryPage } from '@services/rss-feed-items/clear-unlinked-topic-alias-categories'

type RssFeedMaintenanceJob = NamedQueueJob<RssFeedMaintenanceJobPayloads>

export function processRssFeedMaintenanceJob(job: RssFeedMaintenanceJob) {
  const jobName: string = job.name
  switch (job.name) {
    case 'processHardDeleteRssFeedSourcePage':
      return hardDelete.processHardDeleteRssFeedSourcePage(job.data)
    case 'processHardDeleteRssFeedChildPage':
      return hardDelete.processHardDeleteRssFeedChildPage(job.data)
    case 'processFinalizeHardDeleteRssFeed':
      return hardDelete.processFinalizeHardDeleteRssFeed(job.data)
    case 'processRecoverRssFeedHardDeletes':
      return processRecoverRssFeedHardDeletes(job.data)
    case 'processReconcileRssFeedItemCategorySnapshots': {
      if (!job.data) throw new Error('RSS Feed Item Categories job .data is required')
      return itemCategories.processReconcileRssFeedItemCategorySnapshots(job.data)
    }
    case 'processBackfillCategoriesForTopicAliases':
      if (!job.data) throw new Error('RSS Feed Item Categories job .data is required')
      return itemCategories.processBackfillCategoriesForTopicAliases(job.data)
    case 'processBackfillRssFeedCategoriesForTopicAlias':
      if (!job.data) throw new Error('RSS Feed Item Categories job .data is required')
      return itemCategories.processBackfillRssFeedCategoriesForTopicAlias(job.data)
    case 'processEvaluateRssFeedDiscoverability':
      return processEvaluateRssFeedDiscoverability(job.data)
    case 'processTopicAliasesUpdate':
      if (!job.data) throw new Error('Topic alias job .data is required')
      return topicAliases.processTopicAliasesUpdate(job.data)
    case 'processInvalidatePostsForTopicAliases':
      if (!job.data) throw new Error('Topic alias job .data is required')
      return topicAliases.processInvalidatePostsForTopicAliases(job.data)
    case 'processReconcileTopicAliasCategoryMappings': {
      if (!job.data) throw new Error('Topic alias job .data is required')
      return topicAliases.processReconcileTopicAliasCategoryMappings(job.data)
    }
    case 'processUnlinkTopicAliasPage': {
      if (!job.data) throw new Error('Topic alias job .data is required')
      return applyTopicAliasUnlinkPage(job.data, {
        clearItemCategoryPage: clearTopicAliasUnlinkCategoryPage,
      })
    }
    case 'processRecoverTopicAliasUnlinks': {
      if (!job.data) throw new Error('Topic alias job .data is required')
      return recoverTopicAliasUnlinks(job.data.afterId)
    }
    default:
      throw new Error(`RSS feed maintenance job ${jobName} not found`)
  }
}
