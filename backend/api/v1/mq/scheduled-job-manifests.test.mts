import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateScheduledJobManifests } from '@modules/scheduled-job-manifest'
import { policyManagedWorkerQueueNames } from '@modules/worker-queue-inventory'
import { BLOOM_FILTER_REBUILD_INPUTS } from '@queues/bloom-filters/types'
import { enqueueGlideMqStats } from '@queues/heartbeat/enqueues'
import {
  PRIORITY_DEFAULT,
  REFRESH_MATERIALIZED_VIEW_JOB_NAME,
  RSS_FEED_CRAWL_TIERS_VIEW,
} from '@queues/psql/config'
import { psql } from '@queues/psql/queues'
import { PSQL_SCHEDULED_ADMIN_JOB_TYPES } from '@queues/psql/types'
import { BACKFILL_REGISTRY } from './backfills-registry.mts'
import { SCHEDULED_JOB_MANIFESTS } from './scheduled-job-manifests.mts'
import { SCHEDULED_JOB_API_ORDER, SCHEDULED_JOBS_REGISTRY } from './scheduled-jobs-registry.mts'

const EXPECTED_SCHEDULED_JOBS = [
  'account-data-requests/account-data-requests-cleanup',
  'account-data-requests/accountDataRequestRecovery',
  'activitypub-inbox/activitypub-inbox-recovery',
  'activitypub-inbox/activitypub-inbox-cleanup',
  'ai_agents/reconcileAutoDispatchJudgements',
  'ai_agents/reconcileBackgroundResponses',
  'ai_agents/reconcileChatRuntimeGenerations',
  'ai_agents/reconcileMemberSupportAgentIntents',
  'bedrock-embeddings-batch/backlog_dispatcher',
  'bedrock-embeddings-batch/creation_dispatcher',
  'bedrock-embeddings-batch/poll_dispatcher',
  'bedrock-embeddings-batch/stale_cleanup_dispatcher',
  'bloom-filters/backfillEntityCacheBloomFilter_communities',
  'bloom-filters/backfillEntityCacheBloomFilter_posts',
  'bloom-filters/backfillEntityCacheBloomFilter_rss_feed_items',
  'bloom-filters/backfillEntityCacheBloomFilter_topics',
  'bloom-filters/backfillEntityCacheBloomFilter_users',
  'bloom-filters/rebuildApiKeyBloomFilter',
  'bloom-filters/rebuildEmailBlocklistBloomFilter',
  'bloom-filters/rebuildEmbeddingBloomFilter',
  'bloom-filters/rebuildUrlBlocklistBloomFilter',
  'crawl_html_boilerplate_removal/boilerplate_removal_dispatcher',
  'crawl_hostnames/crawl_cleanup',
  'crawl_hostnames/crawl_hostnames_dispatcher',
  'crawl_hostnames/crawl_tier1_dispatcher',
  'crawl_hostnames/crawl_tier2_dispatcher',
  'crawl_hostnames/refresh_hostname_crawler_dispatcher',
  'crawl_referral_links/crawl_referral_links_dispatcher',
  'emails/dispatchCommunityModerationSummaryEmails',
  'emails/dispatchEngagementEmails',
  'entity-listeners/entityListenerReconciliation',
  'entity-listeners/reconcilePostCategoryFinalizations',
  'find-your-friends/dispatchFindYourFriends',
  'heartbeat/publish-glidemq-stats',
  'images/cleanup-abandoned-uploads-schedule',
  'kagi-smallweb/kagi-smallweb-sync',
  'memberships/dispatchMembershipRefundReconciliation',
  'memberships/membershipEntitlementEffects',
  'memberships/membershipGrantExpiry',
  'memberships/appleNotificationRecovery',
  'memberships/googlePlayNotificationRecovery',
  'memberships/googlePlayAcknowledgementRecovery',
  'memberships/googlePlayActiveSourceRecovery',
  'memberships/googlePlayOidcTrustRefresh',
  'memberships/microsoftStoreSourceRecovery',
  'memberships/membershipVerificationRecovery',
  'memberships/renewalNotificationCheck',
  'memberships/stripeCatalogReconciliation',
  'memberships/stripeEventRecovery',
  'notifications/community-activity-digest-weekly',
  'notifications/notification-push-intent-recovery',
  'openai_moderation_omni_single/reconcile-image-quarantines',
  'openai_moderation_omni_single/reconcile-post-moderation',
  'oauth-authorization-exchange/oauthAuthorizationExchangeDispatcher',
  'post-publication/reconcile-post-publication',
  'psql/cleanup-partitions-daily',
  'psql/create-partitions-monthly',
  'psql/data-retention-cleanup-daily',
  'psql/reconcile-vote-drift',
  'psql/refresh-rss-feed-crawl-tiers',
  'psql/refresh-top-hashtags',
  'rss-feeds/dispatchRssFeeds',
  'rss-feed-item-categories/reconcileRssFeedItemCategorySnapshots',
  'topic-aliases/reconcileTopicAliasCategoryMappings',
  'ses_inbound/ses-inbound-reconciliation',
  'sitemaps/sitemaps-backfill-processMonthlyBackfillArchiveDispatcher',
  'sitemaps/sitemaps-backfill-processNightlyBackfillWeekDispatcher',
  'sitemaps/sitemaps-backfill-processWeeklyBackfillMonthDispatcher',
  'story-post-related-url-projections/reconcileStoryPostRelatedUrlProjections',
  'unfurl_referral_links/unfurl_referral_links_dispatcher',
  'urls-domains-blacklist/blacklistDispatcher',
  'user-deletions/userDeletionRecovery',
  'vote-weight/dailyVoteWeightRecalculation',
].sort()

describe('scheduled job manifest catalog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('imports the exact 30 manifests and 74 runtime schedulers', () => {
    expect(SCHEDULED_JOB_MANIFESTS).toHaveLength(30)
    expect(
      SCHEDULED_JOB_MANIFESTS.flatMap(manifest =>
        manifest.jobs.map(job => `${manifest.queueName}/${job.schedulerId}`),
      ).sort(),
    ).toEqual(EXPECTED_SCHEDULED_JOBS)
  })

  it('validates every manifest and operator surface', () => {
    expect(() => validateScheduledJobManifests(SCHEDULED_JOB_MANIFESTS)).not.toThrow()
    for (const manifest of SCHEDULED_JOB_MANIFESTS) {
      for (const job of manifest.jobs) expect(job.operatorSurfaces.length).toBeGreaterThan(0)
    }
  })

  it('uses only policy-managed queues or the universal heartbeat queue', () => {
    const queues = new Set(policyManagedWorkerQueueNames())
    expect(
      SCHEDULED_JOB_MANIFESTS.every(
        manifest => queues.has(manifest.queueName) || manifest.queueName === 'heartbeat',
      ),
    ).toBe(true)
  })

  it('references only live operator inputs', () => {
    const backfills = new Set(BACKFILL_REGISTRY.map(backfill => backfill.id))
    const psql = new Set<string>(PSQL_SCHEDULED_ADMIN_JOB_TYPES)
    const blooms = new Set<string>(BLOOM_FILTER_REBUILD_INPUTS)
    const valid = SCHEDULED_JOB_MANIFESTS.flatMap(manifest =>
      manifest.jobs.flatMap(job => job.operatorSurfaces),
    ).map(surface => {
      if (surface.kind === 'backfill') return backfills.has(surface.backfillId)
      if (surface.kind === 'psql') return psql.has(surface.jobType)
      if (surface.kind === 'valkey-bloom-filter') return blooms.has(surface.rebuildInput)
      return true
    })
    expect(valid).not.toContain(false)
    expect(
      SCHEDULED_JOB_MANIFESTS.flatMap(manifest => manifest.jobs)
        .flatMap(job => job.operatorSurfaces)
        .flatMap(surface => (surface.kind === 'psql' ? [surface.jobType] : []))
        .sort(),
    ).toEqual([...PSQL_SCHEDULED_ADMIN_JOB_TYPES].sort())
  })

  it('projects every scheduled API surface', () => {
    expect(SCHEDULED_JOBS_REGISTRY).toHaveLength(57)
    expect(SCHEDULED_JOBS_REGISTRY.map(job => job.id)).toEqual(SCHEDULED_JOB_API_ORDER)
    expect(new Set(SCHEDULED_JOBS_REGISTRY.map(job => job.id)).size).toBe(
      SCHEDULED_JOBS_REGISTRY.length,
    )
    for (const job of SCHEDULED_JOBS_REGISTRY) expect(typeof job.trigger).toBe('function')
    expect(SCHEDULED_JOBS_REGISTRY).toContainEqual({
      id: 'publish-glidemq-stats',
      queue_name: 'heartbeat',
      job_name: 'publish-glidemq-stats',
      schedule: 'every 5m',
      description: 'Publish class-aggregated GlideMQ depth and staleness to CloudWatch',
      trigger: enqueueGlideMqStats,
    })
    expect(SCHEDULED_JOBS_REGISTRY).toContainEqual(
      expect.objectContaining({
        id: 'reconcileChatRuntimeGenerations',
        queue_name: 'ai_agents',
        job_name: 'reconcile-chat-runtime-generations',
        schedule: '*/5 * * * *',
        trigger: expect.any(Function),
      }),
    )
    expect(SCHEDULED_JOBS_REGISTRY).toContainEqual(
      expect.objectContaining({
        id: 'stripeCatalogReconciliation',
        queue_name: 'memberships',
        job_name: 'reconcileStripeMembershipCatalog',
        schedule: 'every 5m',
      }),
    )
    expect(
      SCHEDULED_JOBS_REGISTRY.map(({ trigger, ...job }) => ({
        ...job,
        triggerName: trigger.name || '[anonymous]',
      })),
    ).toMatchSnapshot()
  })

  it('keeps the crawl-tier materialized-view trigger behavior', async () => {
    const entry = SCHEDULED_JOBS_REGISTRY.find(job => job.id === 'refreshRssFeedCrawlTiers')
    if (!entry) throw new Error('refreshRssFeedCrawlTiers scheduled job not found')
    const add = vi.spyOn(psql, 'add').mockResolvedValue(undefined as never)
    await entry.trigger()
    expect(add).toHaveBeenCalledExactlyOnceWith(
      REFRESH_MATERIALIZED_VIEW_JOB_NAME,
      { viewName: RSS_FEED_CRAWL_TIERS_VIEW },
      expect.objectContaining({ priority: PRIORITY_DEFAULT }),
    )
  })

  it('pins every runtime scheduler contract', () => {
    expect(
      SCHEDULED_JOB_MANIFESTS.flatMap(manifest =>
        manifest.jobs.map(job => ({
          queueName: manifest.queueName,
          schedulerId: job.schedulerId,
          repeat: typeof job.repeat === 'function' ? '[runtime repeat]' : job.repeat,
          template: {
            name: job.template.name,
            ...resolveTemplateData(job.template),
            opts: resolve(job.template.opts),
          },
          environment: job.environment ?? 'all',
          registration: job.registration ?? 'parallel',
          operatorSurfaces: job.operatorSurfaces.map(surface =>
            surface.kind === 'scheduled-jobs' ? { ...surface, trigger: '[function]' } : surface,
          ),
        })),
      ),
    ).toMatchSnapshot()
  })
})

function resolve<T>(value: T | (() => T)): T
function resolve<T>(value: T | (() => T) | undefined): T | undefined
function resolve<T>(value: T | (() => T) | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value
}

function resolveTemplateData(
  template: (typeof SCHEDULED_JOB_MANIFESTS)[number]['jobs'][number]['template'],
): { data?: unknown } {
  const data = template.dataFactory === undefined ? template.data : template.dataFactory()
  return data === undefined ? {} : { data: normalizeData(data) }
}

function normalizeData(data: unknown): unknown {
  if (
    typeof data === 'object' &&
    data !== null &&
    'scheduled_at' in data &&
    typeof data.scheduled_at === 'string'
  ) {
    return { ...data, scheduled_at: '[runtime ISO timestamp]' }
  }
  return data
}
