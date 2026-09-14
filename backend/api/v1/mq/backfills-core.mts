import type { BackfillEntry } from './backfills-types.mts'
import {
  createBackfillDispatcherTrigger,
  createBackfillTrigger,
} from './backfills-trigger-helpers.mts'
import {
  enqueueBackfillPostModeration,
  enqueueBackfillImageModeration,
} from '@queues/openai-moderation/enqueues'
import {
  enqueueBackfillLanguageDetectionPosts,
  enqueueBackfillLanguageDetectionRssFeedItems,
  enqueueBackfillLanguageDetectionCrawls,
  enqueueBackfillLanguageDetectionCommunities,
  enqueueBackfillLanguageDetectionUsers,
  enqueueBackfillLanguageDetectionTopics,
} from '@queues/language-detection/enqueues'
import { enqueueBackfillFollowerDistributions } from '@queues/follower-distributions/enqueues'
import { enqueueBackfillReportJudgements } from '@queues/ai-agents/enqueues/report-judgement'
import { enqueueBackfillReportIntegrity } from '@queues/report-integrity/enqueues'
import {
  enqueueBackfillBlueskyDisconnectRequests,
  enqueueBackfillBlueskyFollowPropagation,
} from '@queues/bluesky-follow-propagation/enqueues'
import { enqueueReconcileEntities } from '@queues/entity-listeners/enqueues'
import { enqueueRecoverExportRequests } from '@queues/account-data-requests/enqueues'
import { enqueueRecoverUserDeletions } from '@queues/user-deletions/enqueues'
import { enqueueRecoverStripeEvents } from '@queues/memberships/enqueues'
import { enqueueSesInboundReconcile } from '@queues/ses-inbound/enqueues'
import { SES_INBOUND_RECONCILE_JOB_NAME } from '@queues/ses-inbound/config'
import { enqueueBackfillCrawlEmbeds } from '@queues/crawl-embeds/enqueues'
import { POST_PUBLICATION_BACKFILLS } from './backfills-post-publication.mts'

export const CORE_BACKFILLS: BackfillEntry[] = [
  ...POST_PUBLICATION_BACKFILLS,
  {
    id: 'crawl-embeds-pending',
    queue_name: 'crawl_embeds',
    job_name: 'backfill_crawl_embeds',
    description: 'Re-enqueue crawls with a pending crawl-local oEmbed endpoint',
    source_table: 'crawls',
    trigger: createBackfillDispatcherTrigger('crawl-embeds-pending', enqueueBackfillCrawlEmbeds),
  },
  {
    id: 'ses-inbound-reconciliation',
    queue_name: 'ses_inbound',
    job_name: SES_INBOUND_RECONCILE_JOB_NAME,
    description: 'Re-enqueue raw inbound support emails still present in S3',
    source_table: 'external:ses-inbound-s3',
    trigger: createBackfillTrigger(enqueueSesInboundReconcile),
  },
  {
    id: 'entity-listener-reconciliation',
    queue_name: 'entity-listeners',
    job_name: 'reconcileEntities',
    description: 'Reconcile recently changed active entities from the durable checkpoint',
    source_table: 'queue_reconciliation_checkpoints,users,topics,posts,images,urls',
    trigger: createBackfillTrigger(enqueueReconcileEntities),
  },
  {
    id: 'account-data-request-recovery',
    queue_name: 'account-data-requests',
    job_name: 'recoverExportRequests',
    description: 'Recover persisted account export requests that were not completed',
    source_table: 'user_data_requests',
    trigger: createBackfillTrigger(enqueueRecoverExportRequests),
  },
  {
    id: 'user-deletion-recovery',
    queue_name: 'user-deletions',
    job_name: 'recoverUserDeletions',
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
    id: 'openai-moderation-posts',
    queue_name: 'openai_moderation_omni_single',
    job_name: 'backfill_posts',
    description: 'Backfill OpenAI moderation for posts missing results',
    source_table: 'posts',
    trigger: createBackfillTrigger(enqueueBackfillPostModeration),
  },
  {
    id: 'openai-moderation-images',
    queue_name: 'openai_moderation_omni_single',
    job_name: 'backfill_images',
    description: 'Backfill OpenAI moderation for images missing results',
    source_table: 'images',
    trigger: createBackfillTrigger(enqueueBackfillImageModeration),
  },
  {
    id: 'language-detection-posts',
    queue_name: 'language_detection',
    job_name: 'backfill_posts',
    description: 'Backfill language detection for posts missing results',
    source_table: 'posts',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionPosts),
  },
  {
    id: 'language-detection-rss-feed-items',
    queue_name: 'language_detection',
    job_name: 'backfill_rss_feed_items',
    description: 'Backfill language detection for RSS feed items missing results',
    source_table: 'rss_feed_items',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionRssFeedItems),
  },
  {
    id: 'language-detection-crawls',
    queue_name: 'language_detection',
    job_name: 'backfill_crawls',
    description: 'Backfill language detection for crawls missing results',
    source_table: 'crawls',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionCrawls),
  },
  {
    id: 'language-detection-communities',
    queue_name: 'language_detection',
    job_name: 'backfill_communities',
    description: 'Backfill language detection for communities missing results',
    source_table: 'communities',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionCommunities),
  },
  {
    id: 'language-detection-users',
    queue_name: 'language_detection',
    job_name: 'backfill_users',
    description: 'Backfill language detection for user bios missing results',
    source_table: 'users',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionUsers),
  },
  {
    id: 'language-detection-topics',
    queue_name: 'language_detection',
    job_name: 'backfill_topics',
    description: 'Backfill language detection for topics missing results',
    source_table: 'topics',
    trigger: createBackfillTrigger(enqueueBackfillLanguageDetectionTopics),
  },
  {
    id: 'follower-distributions',
    queue_name: 'follower-distributions',
    job_name: 'backfillFollowerDistributions',
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
    queue_name: 'report_integrity',
    job_name: 'backfill_report_integrity',
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
