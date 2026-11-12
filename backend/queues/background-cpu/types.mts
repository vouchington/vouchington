import type { CrawlUrlJobData } from '../crawler/types.mts'
import type { CrawlDispatchCursor, CrawlHostnameDispatchCursor } from '../crawl-dispatch/types.mts'
import type {
  CrawlReferralLinkEntry,
  ReferralCrawlDispatchData,
} from '../crawl-referral-links/types.mts'
import type {
  RemoveUnfurledChildrenForUserEntry,
  UnfurlDispatchCursor,
  UnfurlReferralLinkEntry,
} from '../unfurl-referral-links/types.mts'
import type { DefaultEmbeddingsJobData } from '../gemini-embeddings/types.mts'
import type { ReconciliationEntityType } from '../gemini-embeddings-batch/types.mts'
import type {
  CleanupAbandonedUploadsData,
  LanguageDetectionBackfillCursor,
} from '../content-analysis/types.mts'
import type { SpendCapRecheckJobData } from '../ai-agents/types.mts'

import type { Job, JobOptions } from 'glide-mq'
import type { BackgroundCpuDomain } from './config.mts'

type GroupRateLimit = { readonly max: number; readonly duration: number }

export type BackgroundCpuDomainDefinition = {
  readonly domain: BackgroundCpuDomain
  readonly rateLimit?: GroupRateLimit
  /** Group deferral is the default for jobs using the domain key. */
  readonly deferral?: 'group' | 'job'
  /** The baseline worker concurrency this domain had as its own queue; the shared worker sums them. */
  readonly workerConcurrency: number
}

export type BackgroundCpuJobSpec = {
  /** Local name, unique inside the domain; the queue-wide name is `<domain>.<name>`. */
  readonly name: string
  readonly priority: number
  readonly attempts?: number
  readonly backoff?: NonNullable<JobOptions['backoff']>
  /** Lock and heartbeat window for this job alone, for domains whose work outlasts the default. */
  readonly lockDuration?: number
  readonly timeout?: number
  readonly removeOnComplete?: JobOptions['removeOnComplete']
  readonly removeOnFail?: JobOptions['removeOnFail']
  readonly ordering?: JobOptions['ordering']
}

/** The phantom `data` member carries the payload type to the enqueue and handler helpers. */
export type BackgroundCpuJobDefinition<TData = unknown> = {
  readonly name: string
  readonly domain: BackgroundCpuDomain
  /** Defaults for every enqueue; the queue resolves ordering concurrency at admission. */
  readonly options: Readonly<JobOptions>
  readonly data?: TData
}

/** One registered job paired with the function that runs it. Workers own the handlers. */
export type BackgroundCpuHandler<TData = unknown> = {
  readonly job: BackgroundCpuJobDefinition<TData>
  // Method syntax keeps handlers of different payload types assignable to `BackgroundCpuHandler`.
  handle(job: Job<TData>): unknown
}

type Empty = Record<string, never>
type BatchCursor = { afterId: string; throughId: string }

/** The only payload contract for jobs admitted to the shared background-cpu queue. */
export type BackgroundCpuJobPayloads = {
  'crawl.crawl_url': CrawlUrlJobData
  'crawl.crawl_referral_link': CrawlReferralLinkEntry
  'crawl.crawl_referral_links_dispatcher': ReferralCrawlDispatchData
  'crawl.unfurl_referral_link': UnfurlReferralLinkEntry
  'crawl.remove_unfurled_children_for_user': RemoveUnfurledChildrenForUserEntry
  'crawl.unfurl_referral_links_dispatcher': { cursor?: UnfurlDispatchCursor }
  'crawl.crawl_hostnames_dispatcher': { cursor?: CrawlHostnameDispatchCursor }
  'crawl.crawl_urls_per_hostname_dispatcher': { hostname_id: string; cursor?: CrawlDispatchCursor }
  'crawl.crawl_tier1_dispatcher': { cursor?: CrawlDispatchCursor }
  'crawl.crawl_tier2_dispatcher': { cursor?: CrawlDispatchCursor }
  'crawl.refresh_hostname_crawler_dispatcher': { cursor?: CrawlDispatchCursor }
  'crawl.refresh_hostname_crawler': { hostname_id: string }
  'crawl.crawl_cleanup': { cutoffId?: string }
  'crawl.boilerplate_removal_dispatcher': Empty
  'crawl.boilerplate_removal': { hostname_id: string; parent_path: string }
  'gemini-embeddings.topic': DefaultEmbeddingsJobData
  'gemini-embeddings.post': DefaultEmbeddingsJobData
  'gemini-embeddings.rss_feed_item': DefaultEmbeddingsJobData
  'gemini-embeddings.create_topics': Empty
  'gemini-embeddings.create_posts': Empty
  'gemini-embeddings.create_rss_feed_items': Empty
  'gemini-embeddings.create_crawl_chunks': Empty
  'gemini-embeddings.create_images': Empty
  'gemini-embeddings.poll_batch': { batch_id: string }
  'gemini-embeddings.poll_dispatcher': { cursor?: BatchCursor }
  'gemini-embeddings.creation_dispatcher': { cursor?: BatchCursor }
  'gemini-embeddings.backlog_dispatcher': { cursor?: BatchCursor }
  'gemini-embeddings.stale_cleanup_dispatcher': { cursor?: BatchCursor }
  'gemini-embeddings.reconcile_existing': { entityType: ReconciliationEntityType; after?: string }
  'gemini-embeddings.post_trigger_recovery': { after?: string }
  'ai-spend-cap.recheck': SpendCapRecheckJobData
  'content-analysis.post': { id: string }
  'content-analysis.rss_feed_item': { id: string }
  'content-analysis.crawl': { id: string }
  'content-analysis.community': { id: string }
  'content-analysis.user': { id: string }
  'content-analysis.topic': { id: string }
  'content-analysis.staydown-hash': { id: string }
  'content-analysis.backfill_posts': { cursor?: LanguageDetectionBackfillCursor }
  'content-analysis.backfill_rss_feed_items': { cursor?: LanguageDetectionBackfillCursor }
  'content-analysis.backfill_crawls': { cursor?: LanguageDetectionBackfillCursor }
  'content-analysis.backfill_communities': { cursor?: LanguageDetectionBackfillCursor }
  'content-analysis.backfill_users': { cursor?: LanguageDetectionBackfillCursor }
  'content-analysis.backfill_topics': { cursor?: LanguageDetectionBackfillCursor }
  'content-analysis.cleanup-abandoned-uploads': CleanupAbandonedUploadsData
}
