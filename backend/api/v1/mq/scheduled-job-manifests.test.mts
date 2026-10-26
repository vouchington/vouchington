import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateScheduledJobManifests } from '../../../modules/scheduled-job-manifest/validation.mts'
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
import { BACKFILL_REGISTRY } from '@services/queue-monitoring/backfills-registry'
import { SCHEDULED_JOB_MANIFESTS } from '@services/queue-monitoring/scheduled-job-manifests'
import {
  SCHEDULED_JOB_API_ORDER,
  SCHEDULED_JOBS_REGISTRY,
} from '@services/queue-monitoring/scheduled-jobs-registry'

const EXPECTED_SCHEDULED_JOBS = [
  'background-cpu/bedrock-embeddings:backlog-dispatcher',
  'background-cpu/bedrock-embeddings:creation-dispatcher',
  'background-cpu/bedrock-embeddings:poll-dispatcher',
  'background-cpu/bedrock-embeddings:post_trigger_recovery',
  'background-cpu/bedrock-embeddings:reconcile_existing_posts',
  'background-cpu/bedrock-embeddings:reconcile_existing_rss_feed_items',
  'background-cpu/bedrock-embeddings:reconcile_existing_topics',
  'background-cpu/bedrock-embeddings:stale-cleanup-dispatcher',
  'background-cpu/content-analysis:cleanup-abandoned-uploads-schedule',
  'background-cpu/crawl:boilerplate-removal-dispatcher',
  'background-cpu/crawl:crawl_cleanup',
  'background-cpu/crawl:crawl_hostnames_dispatcher',
  'background-cpu/crawl:crawl_tier1_dispatcher',
  'background-cpu/crawl:crawl_tier2_dispatcher',
  'background-cpu/crawl:referral-links-dispatcher',
  'background-cpu/crawl:refresh_hostname_crawler_dispatcher',
  'background-cpu/crawl:unfurl-referral-links-dispatcher',
  'background/account-data-requests-cleanup',
  'background/accountDataRequestRecovery',
  'background/activitypub-outbound-follows-recovery',
  'background/activitypub-outbound-votes-recovery',
  'background/activitypub-inbox-recovery',
  'background/activitypub-inbox-cleanup',
  'ai_agents/reconcileAutoDispatchJudgements',
  'ai_agents/reconcileBackgroundResponses',
  'ai_agents/reconcileCopyrightAgentDispatches',
  'ai_agents/reconcileClassifierRuns',
  'background/email-digests-api-key-expiry',
  'background/email-digests-moderation-summary',
  'background/email-digests-engagement',
  'background/entityListenerReconciliation',
  'find-your-friends/dispatchFindYourFriends',
  'heartbeat/publish-glidemq-stats',
  'background/kagi-smallweb-sync',
  'background/imports-recover-stalled',
  'memberships/dispatchMembershipPauseCollection',
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
  'background/hostnameCacheInvalidationSweep',
  'background/community-activity-digest-weekly',
  'background/media-delivery-registry-reconciliation',
  'background/copyright-action-reconciliation',
  'background/copyright-delivery-reconciliation',
  'background/copyright-dsa-statement-reconciliation',
  'background/copyright-evidence-retention',
  'background/copyright-review-target-page',
  'background/notification-push-intent-recovery',
  'background/reconcile-image-quarantines',
  'background/reconcile-post-moderation',
  'background/oauthAuthorizationExchangeDispatcher',
  'psql/cleanup-partitions-daily',
  'psql/create-partitions-monthly',
  'psql/data-retention-cleanup-daily',
  'psql/reconcile-vote-drift',
  'psql/refresh-platform-stats',
  'psql/refresh-revenue-changes',
  'psql/refresh-revenue-memberships',
  'psql/refresh-rss-feed-crawl-tiers',
  'psql/refresh-top-hashtags',
  'psql/refresh-trending-rss-feeds',
  'background/dispatchRssFeeds',
  'rss-feed-maintenance/reconcileRssFeedItemCategorySnapshots',
  'rss-feed-maintenance/reconcileTopicAliasCategoryMappings',
  'rss-feed-maintenance/recoverRssFeedHardDeletes',
  'background/ses-inbound-reconciliation',
  'background/sitemaps-backfill-processMonthlyBackfillArchiveDispatcher',
  'background/sitemaps-backfill-processNightlyBackfillWeekDispatcher',
  'background/sitemaps-backfill-processWeeklyBackfillMonthDispatcher',
  'background/reconcileStoryPostRelatedUrlProjections',
  'background/blacklistDispatcher',
  'background/userDeletionRecovery',
  'background/voteWeightAgeMilestones',
  'background/voteWeightMembershipExpirations',
  'background/voteWeightFamilySourceChanges',
  'background/voteWeightDirtyMarkers',
].toSorted()

describe('scheduled job manifest catalog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('imports the exact 9 manifests and 84 live jobs', () => {
    expect(SCHEDULED_JOB_MANIFESTS).toHaveLength(9)
    expect(
      SCHEDULED_JOB_MANIFESTS.flatMap(manifest =>
        manifest.jobs.map(job => `${manifest.queueName}/${job.schedulerId}`),
      ).toSorted(),
    ).toEqual(EXPECTED_SCHEDULED_JOBS)
  })

  it('validates every manifest and operator surface', () => {
    expect(() => validateScheduledJobManifests(SCHEDULED_JOB_MANIFESTS)).not.toThrow()
    for (const manifest of SCHEDULED_JOB_MANIFESTS) {
      for (const job of manifest.jobs) expect(job.operatorSurfaces.length).toBeGreaterThan(0)
    }
  })

  it('uses only policy-managed queues, the universal heartbeat queue, or empty tombstones', () => {
    const queues = new Set(policyManagedWorkerQueueNames())
    expect(
      SCHEDULED_JOB_MANIFESTS.every(
        manifest =>
          queues.has(manifest.queueName) ||
          manifest.queueName === 'heartbeat' ||
          manifest.jobs.length === 0,
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
        .toSorted(),
    ).toEqual([...PSQL_SCHEDULED_ADMIN_JOB_TYPES].toSorted())
  })

  it('projects every scheduled API surface', () => {
    expect(SCHEDULED_JOBS_REGISTRY).toHaveLength(79)
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
        id: 'reconcileClassifierRuns',
        queue_name: 'ai_agents',
        job_name: 'reconcile-classifier-runs',
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
