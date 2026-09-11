import type { BackfillEntry } from './backfills-types.mts'
import { createBackfillDispatcherTrigger } from './backfills-trigger-helpers.mts'
import {
  enqueueCrawlHostnamesDispatcher,
  enqueueCrawlTier1Dispatcher,
  enqueueCrawlTier2Dispatcher,
} from '@queues/crawl-hostnames/enqueues'
import { enqueueEmbeddingsBatchPollDispatcher } from '@queues/bedrock-embeddings-batch/enqueues'
import { enqueueOAuthAuthorizationExchangeDispatcher } from '@queues/oauth-authorization-exchange/enqueues'
import {
  enqueueNightlyBackfillWeekDispatcher,
  enqueueWeeklyBackfillMonthDispatcher,
  enqueueMonthlyBackfillArchiveDispatcher,
} from '@queues/sitemaps/enqueues'

export const EXISTING_CORE_DISPATCHER_BACKFILLS: BackfillEntry[] = [
  {
    id: 'oauth-authorization-exchange-dispatch',
    queue_name: 'oauth-authorization-exchange',
    job_name: 'dispatchOAuthAuthorizationExchanges',
    description: 'Dispatch persisted OAuth callbacks that still require provider exchange',
    source_table: 'oauth_authorizations',
    trigger: createBackfillDispatcherTrigger(
      'oauth-authorization-exchange-dispatch',
      enqueueOAuthAuthorizationExchangeDispatcher,
    ),
  },
  {
    id: 'crawl-hostnames-dispatch',
    queue_name: 'crawl_hostnames',
    job_name: 'crawl_hostnames_dispatcher',
    description: 'Dispatch hostname crawl jobs from the hostnames source of truth',
    source_table: 'url_hostnames',
    trigger: createBackfillDispatcherTrigger(
      'crawl-hostnames-dispatch',
      enqueueCrawlHostnamesDispatcher,
    ),
  },
  {
    id: 'crawl-tier1-dispatch',
    queue_name: 'crawl_hostnames',
    job_name: 'crawl_tier1_dispatcher',
    description: 'Dispatch tier-1 hostname crawl jobs from the hostnames source of truth',
    source_table: 'urls',
    trigger: createBackfillDispatcherTrigger('crawl-tier1-dispatch', enqueueCrawlTier1Dispatcher),
  },
  {
    id: 'crawl-tier2-dispatch',
    queue_name: 'crawl_hostnames',
    job_name: 'crawl_tier2_dispatcher',
    description: 'Dispatch tier-2 hostname crawl jobs from the hostnames source of truth',
    source_table: 'urls',
    trigger: createBackfillDispatcherTrigger('crawl-tier2-dispatch', enqueueCrawlTier2Dispatcher),
  },
  {
    id: 'sitemaps-nightly-week',
    queue_name: 'sitemaps',
    job_name: 'processNightlyBackfillWeekDispatcher',
    description: 'Dispatch sitemap backfills for the current week',
    source_table: 'posts',
    trigger: createBackfillDispatcherTrigger(
      'sitemaps-nightly-week',
      enqueueNightlyBackfillWeekDispatcher,
    ),
  },
  {
    id: 'sitemaps-weekly-month',
    queue_name: 'sitemaps',
    job_name: 'processWeeklyBackfillMonthDispatcher',
    description: 'Dispatch sitemap backfills for the current month',
    source_table: 'posts',
    trigger: createBackfillDispatcherTrigger(
      'sitemaps-weekly-month',
      enqueueWeeklyBackfillMonthDispatcher,
    ),
  },
  {
    id: 'sitemaps-monthly-archive',
    queue_name: 'sitemaps',
    job_name: 'processMonthlyBackfillArchiveDispatcher',
    description: 'Dispatch sitemap archive backfills',
    source_table: 'posts',
    trigger: createBackfillDispatcherTrigger(
      'sitemaps-monthly-archive',
      enqueueMonthlyBackfillArchiveDispatcher,
    ),
  },
  {
    id: 'bedrock-embeddings-poll-dispatch',
    queue_name: 'bedrock-embeddings-batch',
    job_name: 'poll_dispatcher',
    description: 'Dispatch polling jobs for pending Bedrock batches',
    source_table: 'bedrock_embeddings_batches',
    trigger: createBackfillDispatcherTrigger(
      'bedrock-embeddings-poll-dispatch',
      enqueueEmbeddingsBatchPollDispatcher,
    ),
  },
]
