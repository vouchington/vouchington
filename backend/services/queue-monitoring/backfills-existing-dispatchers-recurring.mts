import type { BackfillEntry } from './backfills-types.mts'
import {
  createBackfillDispatcherTrigger,
  createPriorityBackfillTrigger,
} from './backfills-trigger-helpers.mts'
import { enqueueDispatchFindYourFriends } from '@queues/find-your-friends/enqueues'
import { enqueueKagiSmallWebSync } from '@queues/kagi-smallweb/enqueues'
import { enqueueBackfillBloomFilter } from '@queues/bloom-filters/enqueues'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import { KAGI_SMALLWEB_SYNC_JOB } from '@queues/background/enqueues/kagi-smallweb-jobs'
import {
  VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB,
  VOTE_AGGREGATION_AGE_MILESTONES_JOB,
  VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB,
  VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB,
  VOTE_AGGREGATION_DIRTY_MARKERS_JOB,
} from '@queues/background/enqueues/vote-aggregation-jobs'
import {
  enqueueRecalculateVoteWeightDispatcher,
  enqueueVoteWeightAgeMilestones,
  enqueueVoteWeightMembershipExpirations,
  enqueueVoteWeightFamilySourceChanges,
  enqueueVoteWeightDirtyMarkers,
} from '@queues/vote-aggregation/enqueues/vote-weight'
import { enqueueReconcileTopicAliasCategoryMappings } from '@queues/rss-feed-maintenance/enqueues/topic-aliases'
import type { BloomFilterEntityType } from '@queues/bloom-filters/types'

function createVoteWeightTrigger(): () => Promise<unknown> {
  return async () =>
    enqueueRecalculateVoteWeightDispatcher(undefined, {
      deduplicationId: 'backfill:relation-election-updates',
      replayElectionsOnly: true,
    })
}

function createBloomFilterTrigger(entityType: BloomFilterEntityType): () => Promise<unknown> {
  return createPriorityBackfillTrigger({ entityType }, enqueueBackfillBloomFilter)
}

export const EXISTING_RECURRING_DISPATCHER_BACKFILLS: BackfillEntry[] = [
  {
    id: 'topic-aliases-category-mapping-reconciliation',
    queue_name: 'rss-feed-maintenance',
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
    id: 'relation-election-updates',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: VOTE_AGGREGATION_VOTE_WEIGHT_DISPATCHER_JOB.name,
    description: 'Replay relation election updates from all users and concrete vote ledgers',
    source_table: 'users',
    trigger: createVoteWeightTrigger(),
  },
  {
    id: 'vote-weight-age-milestones',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: VOTE_AGGREGATION_AGE_MILESTONES_JOB.name,
    description: 'Dispatch vote-weight age milestones from users',
    source_table: 'users',
    trigger: createBackfillDispatcherTrigger('vote-weight-age-milestones', async options => {
      const result = await enqueueVoteWeightAgeMilestones({}, options)
      return result
    }),
  },
  {
    id: 'vote-weight-membership-expirations',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: VOTE_AGGREGATION_MEMBERSHIP_EXPIRATIONS_JOB.name,
    description: 'Dispatch vote-weight membership expirations',
    source_table: 'memberships',
    trigger: createBackfillDispatcherTrigger(
      'vote-weight-membership-expirations',
      async options => {
        const result = await enqueueVoteWeightMembershipExpirations({}, options)
        return result
      },
    ),
  },
  {
    id: 'vote-weight-family-source-changes',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: VOTE_AGGREGATION_FAMILY_SOURCE_CHANGES_JOB.name,
    description: 'Dispatch vote-weight family source changes',
    source_table: 'membership_source_states, membership_provider_evidence_records',
    trigger: createBackfillDispatcherTrigger('vote-weight-family-source-changes', async options => {
      const result = await enqueueVoteWeightFamilySourceChanges({}, options)
      return result
    }),
  },
  {
    id: 'vote-weight-dirty-markers',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: VOTE_AGGREGATION_DIRTY_MARKERS_JOB.name,
    description: 'Recover vote-weight recalculation dirty markers',
    source_table: 'users',
    trigger: createBackfillDispatcherTrigger('vote-weight-dirty-markers', async options => {
      const result = await enqueueVoteWeightDirtyMarkers({}, options)
      return result
    }),
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
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: KAGI_SMALLWEB_SYNC_JOB.name,
    description: 'Sync Kagi Small Web data',
    source_table: 'external:kagi-smallweb',
    trigger: createBackfillDispatcherTrigger('kagi-smallweb-sync', enqueueKagiSmallWebSync),
  },
]
