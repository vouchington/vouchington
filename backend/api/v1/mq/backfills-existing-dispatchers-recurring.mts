import type { BackfillEntry } from './backfills-types.mts'
import {
  createBackfillDispatcherTrigger,
  createPriorityBackfillTrigger,
} from './backfills-trigger-helpers.mts'
import { enqueueDispatchFindYourFriends } from '@queues/find-your-friends/enqueues'
import { enqueueKagiSmallWebSync } from '@queues/kagi-smallweb/enqueues'
import { enqueueBackfillBloomFilter } from '@queues/bloom-filters/enqueues'
import { enqueueRecalculateVoteWeightDispatcher } from '@queues/vote-weight/enqueues'
import { enqueueReconcileTopicAliasCategoryMappings } from '@queues/topic-aliases/enqueues'
import type { BloomFilterEntityType } from '@queues/bloom-filters/types'

function createVoteWeightTrigger(): () => Promise<unknown> {
  return async () =>
    await enqueueRecalculateVoteWeightDispatcher(undefined, {
      deduplicationId: 'backfill:vote-weight-dispatch',
    })
}

function createBloomFilterTrigger(entityType: BloomFilterEntityType): () => Promise<unknown> {
  return createPriorityBackfillTrigger({ entityType }, enqueueBackfillBloomFilter)
}

export const EXISTING_RECURRING_DISPATCHER_BACKFILLS: BackfillEntry[] = [
  {
    id: 'topic-aliases-category-mapping-reconciliation',
    queue_name: 'topic-aliases',
    job_name: 'processReconcileTopicAliasCategoryMappings',
    description: 'Drain durable RSS category-mapping transitions for hashtag aliases',
    source_table: 'topic_alias_category_mapping_reconciliations',
    trigger: createBackfillDispatcherTrigger(
      'topic-aliases-category-mapping-reconciliation',
      enqueueReconcileTopicAliasCategoryMappings,
    ),
  },
  {
    id: 'bloom-filters-posts',
    queue_name: 'bloom-filters',
    job_name: 'processBackfillBloomFilter',
    description: 'Backfill post entity-cache bloom filters',
    source_table: 'posts',
    trigger: createBloomFilterTrigger('posts'),
  },
  {
    id: 'bloom-filters-topics',
    queue_name: 'bloom-filters',
    job_name: 'processBackfillBloomFilter',
    description: 'Backfill topic entity-cache bloom filters',
    source_table: 'topics',
    trigger: createBloomFilterTrigger('topics'),
  },
  {
    id: 'bloom-filters-users',
    queue_name: 'bloom-filters',
    job_name: 'processBackfillBloomFilter',
    description: 'Backfill user entity-cache bloom filters',
    source_table: 'users',
    trigger: createBloomFilterTrigger('users'),
  },
  {
    id: 'bloom-filters-communities',
    queue_name: 'bloom-filters',
    job_name: 'processBackfillBloomFilter',
    description: 'Backfill community entity-cache bloom filters',
    source_table: 'communities',
    trigger: createBloomFilterTrigger('communities'),
  },
  {
    id: 'bloom-filters-rss-feed-items',
    queue_name: 'bloom-filters',
    job_name: 'processBackfillBloomFilter',
    description: 'Backfill RSS feed item entity-cache bloom filters',
    source_table: 'rss_feed_items',
    trigger: createBloomFilterTrigger('rss_feed_items'),
  },
  {
    id: 'vote-weight-dispatch',
    queue_name: 'vote-weight',
    job_name: 'processRecalculateVoteWeightDispatcher',
    description: 'Dispatch vote-weight recalculation from users',
    source_table: 'users',
    trigger: createVoteWeightTrigger(),
  },
  {
    id: 'find-your-friends-dispatch',
    queue_name: 'find-your-friends',
    job_name: 'dispatchFindYourFriends',
    description: 'Dispatch find-your-friends social sync jobs',
    source_table: 'facebook_accounts, x_accounts, github_accounts',
    trigger: createBackfillDispatcherTrigger(
      'find-your-friends-dispatch',
      enqueueDispatchFindYourFriends,
    ),
  },
  {
    id: 'kagi-smallweb-sync',
    queue_name: 'kagi-smallweb',
    job_name: 'sync',
    description: 'Sync Kagi Small Web data',
    source_table: 'external:kagi-smallweb',
    trigger: createBackfillDispatcherTrigger('kagi-smallweb-sync', enqueueKagiSmallWebSync),
  },
]
