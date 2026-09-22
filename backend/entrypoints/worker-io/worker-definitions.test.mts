import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { enqueueReconcilePostPublication } from '@queues/post-publication/enqueues'
import { postPublication as postPublicationQueue } from '@queues/post-publication/queues'
import { cachePurge } from '@workers/cache-purge/workers'
import { crawlEmbeds } from '@workers/crawl-embeds/workers'
import { postPublication } from '@workers/post-publication/workers'
import { storyPostRelatedUrlProjections } from '@workers/story-post-related-url-projections/workers'
import { readEnqueuedJob } from '../../test-helpers/queue-jobs.mts'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'

async function closeIdentityLoadedWorkers() {
  await Promise.all([
    cachePurge.close(),
    crawlEmbeds.close(),
    postPublication.close(),
    storyPostRelatedUrlProjections.close(),
  ])
}

function expectLazyImport(
  loadSource: string,
  workerDirectory: string,
  exportName: string,
  moduleName = 'workers',
) {
  expect(loadSource).toContain(workerDirectory)
  expect(loadSource).toContain(moduleName)
  expect(loadSource).toMatch(new RegExp(`\\b${exportName}\\b`))
}

describe('worker-io WORKER_DEFINITIONS load functions', () => {
  beforeAll(closeIdentityLoadedWorkers)
  afterAll(closeIdentityLoadedWorkers)

  it('each worker definition points at the expected lazy import export', () => {
    const expectedDefinitions = [
      [
        'story-post-related-url-projections',
        'story-post-related-url-projections',
        'storyPostRelatedUrlProjections',
      ],
      ['post-publication', 'post-publication', 'postPublication'],
      ['topic-ratings', 'topic-ratings', 'topicRatings'],
      ['elections', 'elections', 'elections'],
      ['entity-metrics-cache-refresh', 'entity-metrics-cache-refresh', 'entityMetricsCacheRefresh'],
      ['cache-purge', 'cache-purge', 'cachePurge'],
      ['entity-listeners', 'entity-listeners', 'entitiesListeners'],
      ['emails', 'emails', 'emails'],
      ['urls-domains-blacklist', 'urls-domains-blacklist', 'urlsDomainsBlacklist'],
      ['rss-feeds', 'rss-feeds', 'rss_feeds'],
      ['rss-feed-discoverability', 'rss-feed-discoverability', 'rssFeedDiscoverability'],
      ['crawl_embeds', 'crawl-embeds', 'crawlEmbeds'],
      ['rss-feed-item-categories', 'rss-feed-item-categories', 'rssFeedItemCategories'],
      ['topic-aliases', 'topic-aliases', 'topicAliases'],
      ['openai_moderation_omni_single', 'openai-moderation', 'openai_moderation_omni_single'],
      ['post-mentions', 'post-mentions', 'postMentions'],
      ['psql', 'psql', 'psql'],
      ['account-data-requests', 'account-data-requests', 'accountDataRequests'],
      ['user-deletions', 'user-deletions', 'userDeletions'],
      [
        'oauth-authorization-exchange',
        'oauth-authorization-exchange',
        'oauthAuthorizationExchangeWorker',
      ],
      ['activitypub-delivery', 'activitypub-delivery', 'activitypubDeliveryWorker'],
      ['activitypub-inbox', 'activitypub-inbox', 'activitypubInboxWorker'],
      ['bloom-filters', 'bloom-filters', 'bloomFilters'],
      ['find-your-friends', 'find-your-friends', 'findYourFriends'],
      ['follower-distributions', 'follower-distributions', 'followerDistributionsWorker'],
      ['sitemaps', 'sitemaps', 'sitemaps'],
      ['memberships', 'memberships', 'memberships'],
      ['notifications', 'notifications', 'notificationsWorker'],
      ['vote-weight', 'vote-weight', 'voteWeight'],
      ['vote-integrity', 'vote-integrity', 'voteIntegrity'],
      ['spam_detection', 'spam-detection', 'spamDetectionWorker'],
      ['ban_evasion', 'ban-evasion', 'banEvasionWorker'],
      ['admin-imports', 'admin-imports', 'adminImports'],
      ['user-rss-feed-imports', 'user-rss-feed-imports', 'userRssFeedImports'],
      ['article-sync', 'article-sync', 'articleSyncWorker'],
      ['kagi-smallweb', 'kagi-smallweb', 'kagiSmallWeb'],
      ['ses_inbound', 'ses-inbound', 'sesInboundWorker'],
      ['report_integrity', 'report-integrity', 'reportIntegrity'],
      [
        'bluesky-follow-propagation',
        'bluesky-follow-propagation',
        'blueskyFollowPropagationWorker',
      ],
    ] as const
    const byQueue = (name: string) =>
      WORKER_DEFINITIONS.find(definition => definition.queueName === name)!

    expect(WORKER_DEFINITIONS.map(definition => definition.queueName)).toEqual(
      expectedDefinitions.map(([queueName]) => queueName),
    )
    for (const [queueName, workerDirectory, exportName] of expectedDefinitions) {
      expectLazyImport(byQueue(queueName).load.toString(), workerDirectory, exportName)
    }
  })

  it('cache-purge definition load resolves to the cachePurge worker', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'cache-purge')!
    const worker = await definition.load()
    try {
      expect(worker).toBe(cachePurge)
    } finally {
      await worker.close()
    }
  })

  it('post-publication definition load resolves to the reconciliation worker', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'post-publication')!
    const worker = await definition.load()
    try {
      expect(worker).toBe(postPublication)
    } finally {
      await worker.close()
    }
  })

  it('story URL projection definition load resolves to its reconciliation worker', async () => {
    const definition = WORKER_DEFINITIONS.find(
      d => d.queueName === 'story-post-related-url-projections',
    )!
    const worker = await definition.load()
    expect(worker).toBe(storyPostRelatedUrlProjections)
  })

  it('persists a unique post-publication dispatcher after definition identity loads', async () => {
    const deduplicationId = `post-publication-definition-${randomUUID()}`
    const dispatch = await readEnqueuedJob(
      postPublicationQueue,
      await enqueueReconcilePostPublication({ deduplicationId }),
    )
    expect(dispatch).toMatchObject({
      name: 'processReconcilePostPublication',
      data: {},
      opts: { deduplication: { id: deduplicationId, mode: 'throttle', ttl: 60_000 } },
    })
  })

  it('crawl-embeds definition load resolves to the crawlEmbeds worker', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'crawl_embeds')!
    const worker = await definition.load()
    try {
      expect(worker).toBe(crawlEmbeds)
    } finally {
      await worker.close()
    }
  })

  it('OAuth authorization exchange definition loads its configured worker', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'oauth-authorization-exchange')!
    const worker = await definition.load()
    try {
      expect(worker).toBeDefined()
    } finally {
      await worker.close()
    }
  })

  it('activitypub-inbox definition load resolves to its worker', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'activitypub-inbox')!
    const worker = await definition.load()
    try {
      expect(worker).toBeDefined()
    } finally {
      await worker.close()
    }
  })
})
