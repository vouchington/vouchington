import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { activitypub } from '@queues/activitypub/queues'
import { cachePurge } from '@workers/cache-purge/workers'
import { crawlEmbeds } from '@workers/crawl-embeds/workers'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'

async function closeIdentityLoadedWorkers() {
  await Promise.all([cachePurge.close(), crawlEmbeds.close()])
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
      ['background', 'background', 'createBackgroundWorker'],
      ['cache-purge', 'cache-purge', 'cachePurge'],
      ['emails', 'emails', 'emails'],
      ['urls-domains-blacklist', 'urls-domains-blacklist', 'urlsDomainsBlacklist'],
      ['rss-feeds', 'rss-feeds', 'rss_feeds'],
      ['rss-feed-maintenance', 'rss-feed-maintenance', 'rssFeedMaintenance'],
      ['crawl_embeds', 'crawl-embeds', 'crawlEmbeds'],
      ['psql', 'psql', 'psql'],
      ['activitypub', 'activitypub', 'activitypubWorker'],
      ['bloom-filters', 'bloom-filters', 'bloomFilters'],
      ['find-your-friends', 'find-your-friends', 'findYourFriends'],
      ['follower-distributions', 'follower-distributions', 'followerDistributionsWorker'],
      ['sitemaps', 'sitemaps', 'sitemaps'],
      ['memberships', 'memberships', 'memberships'],
      ['notifications', 'notifications', 'notificationsWorker'],
      ['spam_detection', 'spam-detection', 'spamDetectionWorker'],
      ['ban_evasion', 'ban-evasion', 'banEvasionWorker'],
      ['admin-imports', 'admin-imports', 'adminImports'],
      ['user-rss-feed-imports', 'user-rss-feed-imports', 'userRssFeedImports'],
      ['kagi-smallweb', 'kagi-smallweb', 'kagiSmallWeb'],
      [
        'bluesky-follow-propagation',
        'bluesky-follow-propagation',
        'createBlueskyFollowPropagationWorker',
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

  it('background definition load builds the shared worker over every domain handler', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'background')!
    const worker = await definition.load()
    try {
      expect(worker).toBeDefined()
    } finally {
      await worker.close()
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

  it('serves post-publication and story URL projections only through the background definition', () => {
    const queueNames = WORKER_DEFINITIONS.map(definition => definition.queueName)
    expect(queueNames).not.toContain('post-publication')
    expect(queueNames).not.toContain('story-post-related-url-projections')
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

  it('activitypub definition load resolves to its worker', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'activitypub')!
    await activitypub.pause()
    try {
      const worker = await definition.load()
      try {
        expect(worker).toBeDefined()
      } finally {
        await worker.close()
      }
    } finally {
      await activitypub.resume()
    }
  })
})
