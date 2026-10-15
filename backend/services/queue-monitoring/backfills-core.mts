import type { BackfillEntry } from './backfills-types.mts'
import {
  createBackfillDispatcherTrigger,
  createBackfillTrigger,
} from './backfills-trigger-helpers.mts'
import {
  enqueueBackfillLanguageDetectionPosts,
  enqueueBackfillLanguageDetectionRssFeedItems,
  enqueueBackfillLanguageDetectionCrawls,
  enqueueBackfillLanguageDetectionCommunities,
  enqueueBackfillLanguageDetectionUsers,
  enqueueBackfillLanguageDetectionTopics,
} from '@queues/content-analysis/enqueues'
import { enqueueBackfillFollowerDistributions } from '@queues/follower-distributions/enqueues'
import { enqueueBackfillReportJudgements } from '@queues/ai-agents/enqueues/report-judgement'
import { enqueueReconcileClassifierRuns } from '@queues/ai-agents/enqueues/reconcile-classifier-runs'
import { BACKGROUND_QUEUE_NAME } from '@queues/background/config'
import {
  ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB,
  ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB,
} from '@queues/background/enqueues/account-lifecycle-jobs'
import { FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB } from '@queues/background/enqueues/follower-distributions-jobs'
import { ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB } from '@queues/background/enqueues/entity-listeners-jobs'
import { VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB } from '@queues/background/enqueues/vote-aggregation-jobs'
import { enqueueBackfillReportIntegrity } from '@queues/vote-aggregation/enqueues/report-integrity'
import {
  enqueueBackfillBlueskyDisconnectRequests,
  enqueueBackfillBlueskyFollowPropagation,
} from '@queues/bluesky-follow-propagation/enqueues'
import { enqueueReconcileEntities } from '@queues/entity-listeners/enqueues'
import { enqueueRecoverExportRequests } from '@queues/account-lifecycle/enqueues/account-data-requests'
import { enqueueRecoverUserDeletions } from '@queues/account-lifecycle/enqueues/user-deletions'
import { enqueueRecoverStripeEvents } from '@queues/memberships/enqueues'
import { enqueueBackfillCrawlEmbeds } from '@queues/crawl-embeds/enqueues'
import { BACKGROUND_BACKFILLS } from './backfills-background.mts'
import { POST_PUBLICATION_BACKFILLS } from './backfills-post-publication.mts'

export const CORE_BACKFILLS: BackfillEntry[] = [
  ...POST_PUBLICATION_BACKFILLS,
  ...BACKGROUND_BACKFILLS,
  {
    id: 'classifier-runs',
    queue_name: 'ai_agents',
    job_name: 'reconcile-classifier-runs',
    description:
      'Re-enqueue incomplete classifier runs and dispatch requested subjects that never got a receipt',
    source_table: 'classifier_runs',
    trigger: createBackfillTrigger(enqueueReconcileClassifierRuns),
  },
  {
    id: 'crawl-embeds-pending',
    queue_name: 'crawl_embeds',
    job_name: 'backfill_crawl_embeds',
    description: 'Re-enqueue crawls with a pending crawl-local oEmbed endpoint',
    source_table: 'crawls',
    trigger: createBackfillDispatcherTrigger('crawl-embeds-pending', enqueueBackfillCrawlEmbeds),
  },
  {
    id: 'entity-listener-reconciliation',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: ENTITY_LISTENERS_RECONCILE_ENTITIES_JOB.name,
    description: 'Reconcile recently changed active entities from the durable checkpoint',
    source_table: 'entity_listener_reconciliation_cursors,users,topics,posts,images,urls',
    trigger: createBackfillTrigger(enqueueReconcileEntities),
  },
  {
    id: 'account-data-request-recovery',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: ACCOUNT_LIFECYCLE_RECOVER_EXPORTS_JOB.name,
    description: 'Recover persisted account export requests that were not completed',
    source_table: 'user_data_requests',
    trigger: createBackfillTrigger(enqueueRecoverExportRequests),
  },
  {
    id: 'user-deletion-recovery',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: ACCOUNT_LIFECYCLE_RECOVER_DELETIONS_JOB.name,
    description: 'Recover durable user deletions that were never started or became stale',
    source_table: 'user_deletion_requests',
    trigger: createBackfillTrigger(enqueueRecoverUserDeletions),
  },
  {
    id: 'stripe-event-recovery',
    queue_name: 'memberships',
    job_name: 'recoverStripeEvents',
    description: 'Recover persisted Stripe events that were not completed',
    source_table: 'stripe_events',
    trigger: createBackfillTrigger(enqueueRecoverStripeEvents),
  },
  {
    id: 'language-detection-posts',
    queue_name: 'content-analysis',
    job_name: 'backfill_posts',
    description: 'Backfill language detection for posts missing results',
    source_table: 'posts',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionPosts),
  },
  {
    id: 'language-detection-rss-feed-items',
    queue_name: 'content-analysis',
    job_name: 'backfill_rss_feed_items',
    description: 'Backfill language detection for RSS feed items missing results',
    source_table: 'rss_feed_items',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionRssFeedItems),
  },
  {
    id: 'language-detection-crawls',
    queue_name: 'content-analysis',
    job_name: 'backfill_crawls',
    description: 'Backfill language detection for crawls missing results',
    source_table: 'crawls',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionCrawls),
  },
  {
    id: 'language-detection-communities',
    queue_name: 'content-analysis',
    job_name: 'backfill_communities',
    description: 'Backfill language detection for communities missing results',
    source_table: 'communities',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionCommunities),
  },
  {
    id: 'language-detection-users',
    queue_name: 'content-analysis',
    job_name: 'backfill_users',
    description: 'Backfill language detection for user bios missing results',
    source_table: 'users',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionUsers),
  },
  {
    id: 'language-detection-topics',
    queue_name: 'content-analysis',
    job_name: 'backfill_topics',
    description: 'Backfill language detection for topics missing results',
    source_table: 'topics',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionTopics),
  },
  {
    id: 'follower-distributions',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: FOLLOWER_DISTRIBUTIONS_BACKFILL_JOB.name,
    description: 'Backfill incomplete manual follower distribution jobs',
    source_table: 'follower_distributions',
    trigger: createBackfillTrigger(enqueueBackfillFollowerDistributions),
  },
  {
    id: 'backfill_report_judgements',
    queue_name: 'ai_agents',
    job_name: 'backfill_report_judgements',
    description: 'Backfill AI judgement for reported entities missing a judgement result',
    source_table: 'moderation_reports',
    trigger: createBackfillTrigger(enqueueBackfillReportJudgements),
  },
  {
    id: 'backfill_report_integrity',
    queue_name: BACKGROUND_QUEUE_NAME,
    job_name: VOTE_AGGREGATION_BACKFILL_REPORT_INTEGRITY_JOB.name,
    description: 'Re-enqueue integrity checks for entities with pending mass-report campaigns',
    source_table: 'moderation_reports',
    trigger: createBackfillTrigger(enqueueBackfillReportIntegrity),
  },
  {
    id: 'bluesky-follow-propagation',
    queue_name: 'bluesky-follow-propagation',
    job_name: 'backfillBlueskyFollowPropagation',
    description: 'Reconcile follow relationships onto linked Bluesky accounts missing a receipt',
    source_table: 'relation__user__follow__user',
    trigger: createBackfillTrigger(enqueueBackfillBlueskyFollowPropagation),
  },
  {
    id: 'bluesky-disconnect-requests',
    queue_name: 'bluesky-follow-propagation',
    job_name: 'backfillBlueskyDisconnectRequests',
    description: 'Re-enqueue durable Bluesky disconnect requests that have not been revoked',
    source_table: 'bluesky_linked_accounts',
    trigger: createBackfillTrigger(enqueueBackfillBlueskyDisconnectRequests),
  },
]
