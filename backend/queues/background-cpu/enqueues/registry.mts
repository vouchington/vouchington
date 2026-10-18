import {
  BACKGROUND_CPU_DOMAINS,
  PRIORITY_DISPATCH,
  PRIORITY_TASK,
  type BackgroundCpuDomain,
} from '../config.mts'
import type {
  BackgroundCpuDomainDefinition,
  BackgroundCpuJobDefinition,
  BackgroundCpuJobSpec,
} from '../types.mts'
import { defineBackgroundCpuDomain, defineBackgroundCpuJob } from './define-job.mts'
import { assertRegistryInvariants } from './registry-invariants.mts'

const crawl = defineBackgroundCpuDomain({ domain: 'crawl', workerConcurrency: 23 })
const bedrock = defineBackgroundCpuDomain({ domain: 'bedrock-embeddings', workerConcurrency: 11 })
const spendCap = defineBackgroundCpuDomain({
  domain: 'ai-spend-cap',
  workerConcurrency: 1,
  group: { kind: 'domain', concurrency: 1 },
})
const contentAnalysis = defineBackgroundCpuDomain({
  domain: 'content-analysis',
  workerConcurrency: 10,
})

export const BACKGROUND_CPU_DOMAIN_DEFINITIONS: readonly BackgroundCpuDomainDefinition[] = [
  crawl,
  bedrock,
  spendCap,
  contentAnalysis,
]

const RETRY_5S = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
const RETRY_1S = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 1_000, jitter: 0.5 },
  removeOnComplete: 100,
  removeOnFail: 100,
}
type JobOverrides = Omit<Partial<BackgroundCpuJobSpec>, 'name' | 'priority'>
const task = (name: string, options: JobOverrides = {}): BackgroundCpuJobSpec => ({
  name,
  priority: PRIORITY_TASK,
  ...RETRY_5S,
  ...options,
})
const dispatch = (name: string, options: JobOverrides = {}): BackgroundCpuJobSpec => ({
  name,
  priority: PRIORITY_DISPATCH,
  ...RETRY_5S,
  ...options,
})
const crawlJob = (spec: BackgroundCpuJobSpec) => defineBackgroundCpuJob(crawl, spec)
const bedrockJob = (spec: BackgroundCpuJobSpec) => defineBackgroundCpuJob(bedrock, spec)
const contentJob = (spec: BackgroundCpuJobSpec) => defineBackgroundCpuJob(contentAnalysis, spec)

/** One queue-wide name per current producer and scheduled tick; names include their domain. */
export const BACKGROUND_CPU_JOBS: readonly BackgroundCpuJobDefinition[] = [
  crawlJob(task('crawl_url', { lockDuration: 120_000 })),
  crawlJob(task('crawl_referral_link', { lockDuration: 120_000 })),
  crawlJob(dispatch('crawl_referral_links_dispatcher')),
  crawlJob(dispatch('enqueueCrawlReferralLinksDispatcher')),
  crawlJob(task('unfurl_referral_link')),
  crawlJob(task('remove_unfurled_children_for_user')),
  crawlJob(dispatch('unfurl_referral_links_dispatcher')),
  crawlJob(dispatch('enqueueUnfurlReferralLinksDispatcher')),
  crawlJob(dispatch('enqueueCrawlHostnamesDispatcher')),
  crawlJob(dispatch('enqueueCrawlTier1Dispatcher')),
  crawlJob(dispatch('enqueueCrawlTier2Dispatcher')),
  crawlJob(dispatch('crawl_hostnames_dispatcher')),
  crawlJob(dispatch('crawl_urls_per_hostname_dispatcher')),
  crawlJob(dispatch('crawl_tier1_dispatcher')),
  crawlJob(dispatch('crawl_tier2_dispatcher')),
  crawlJob(dispatch('refresh_hostname_crawler_dispatcher')),
  crawlJob(task('refresh_hostname_crawler')),
  crawlJob(dispatch('crawl_cleanup')),
  crawlJob(dispatch('boilerplate_removal_dispatcher')),
  crawlJob(task('boilerplate_removal')),
  ...['topic', 'post', 'rss_feed_item'].map(name =>
    bedrockJob(
      task(name, {
        ...RETRY_1S,
        ordering: {
          key: 'bedrock-embeddings:single',
          concurrency: 10,
          rateLimit: { max: 10, duration: 1_000 },
        },
      }),
    ),
  ),
  ...['topics', 'posts', 'rss_feed_items', 'crawl_chunks', 'images'].map(name =>
    bedrockJob(
      task(`create_${name}`, {
        lockDuration: 300_000,
        ordering: { key: 'bedrock-embeddings:creation', concurrency: 1 },
      }),
    ),
  ),
  bedrockJob(
    task('poll_batch', {
      lockDuration: 300_000,
      ordering: {
        key: 'bedrock-embeddings:polling',
        concurrency: 10,
        rateLimit: { max: 10, duration: 1_000 },
      },
    }),
  ),
  ...[
    'poll_dispatcher',
    'creation_dispatcher',
    'backlog_dispatcher',
    'stale_cleanup_dispatcher',
  ].map(name =>
    bedrockJob(
      dispatch(name, {
        lockDuration: 300_000,
        ordering: { key: 'bedrock-embeddings:dispatcher', concurrency: 1 },
      }),
    ),
  ),
  ...['reconcile_existing', 'post_trigger_recovery'].map(name =>
    bedrockJob(
      dispatch(name, {
        lockDuration: 300_000,
        ordering: { key: 'bedrock-embeddings:reconciliation', concurrency: 1 },
      }),
    ),
  ),
  defineBackgroundCpuJob(spendCap, {
    name: 'recheck',
    priority: PRIORITY_TASK,
    attempts: 2_880,
    backoff: { type: 'fixed', delay: 60_000, jitter: 0 },
    removeOnComplete: true,
    removeOnFail: true,
  }),
  ...['post', 'rss_feed_item', 'crawl', 'community', 'user', 'topic', 'staydown-hash'].map(name =>
    contentJob(task(name, { ...RETRY_1S, lockDuration: 120_000 })),
  ),
  ...[
    'backfill_posts',
    'backfill_rss_feed_items',
    'backfill_crawls',
    'backfill_communities',
    'backfill_users',
    'backfill_topics',
    'cleanup-abandoned-uploads',
  ].map(name => contentJob(dispatch(name, { ...RETRY_1S, lockDuration: 120_000 }))),
]

const jobsByName = new Map(BACKGROUND_CPU_JOBS.map(job => [job.name, job]))
const domainsById = new Map(
  BACKGROUND_CPU_DOMAIN_DEFINITIONS.map(domain => [domain.domain, domain]),
)
assertRegistryInvariants(
  BACKGROUND_CPU_JOBS,
  BACKGROUND_CPU_DOMAIN_DEFINITIONS,
  BACKGROUND_CPU_DOMAINS,
)

export function getBackgroundCpuJob(name: string): BackgroundCpuJobDefinition | undefined {
  return jobsByName.get(name)
}

export function requireBackgroundCpuJob(name: string): BackgroundCpuJobDefinition {
  const job = getBackgroundCpuJob(name)
  if (!job) throw new Error(`Unregistered background-cpu job: ${name}`)
  return job
}

export function getBackgroundCpuDomainDefinition(
  domain: BackgroundCpuDomain,
): BackgroundCpuDomainDefinition {
  return domainsById.get(domain)!
}

export function getBackgroundCpuJobNames(domain: BackgroundCpuDomain): string[] {
  return BACKGROUND_CPU_JOBS.flatMap(job => (job.domain === domain ? [job.name] : []))
}

export function getBackgroundCpuWorkerBaseline(): number {
  return BACKGROUND_CPU_DOMAIN_DEFINITIONS.reduce(
    (total, domain) => total + domain.workerConcurrency,
    0,
  )
}
