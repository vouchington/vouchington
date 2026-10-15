import type { WorkerDefinition } from '@backend/worker-runtime'

export const WORKER_DEFINITIONS: WorkerDefinition[] = [
  {
    queueName: 'background',
    load: async () => {
      const [{ createBackgroundWorker }, { BACKGROUND_HANDLERS }] = await Promise.all([
        import('@workers/background/workers/create-worker'),
        import('@workers/background/processors/handlers'),
      ])
      return createBackgroundWorker({ handlers: BACKGROUND_HANDLERS })
    },
  },
  {
    queueName: 'cache-purge',
    load: () => import('@workers/cache-purge/workers').then(module => module.cachePurge),
  },
  {
    queueName: 'emails',
    load: () => import('@workers/emails/workers').then(module => module.emails),
  },
  {
    queueName: 'urls-domains-blacklist',
    load: () =>
      import('@workers/urls-domains-blacklist/workers').then(module => module.urlsDomainsBlacklist),
  },
  {
    queueName: 'rss-feeds',
    load: () => import('@workers/rss-feeds/workers').then(module => module.rss_feeds),
  },
  {
    queueName: 'rss-feed-maintenance',
    load: () =>
      import('@workers/rss-feed-maintenance/workers').then(module => module.rssFeedMaintenance),
  },
  {
    queueName: 'crawl_embeds',
    load: () => import('@workers/crawl-embeds/workers').then(module => module.crawlEmbeds),
  },
  { queueName: 'psql', load: () => import('@workers/psql/workers').then(module => module.psql) },
  {
    queueName: 'bloom-filters',
    load: () => import('@workers/bloom-filters/workers').then(module => module.bloomFilters),
  },
  {
    queueName: 'sitemaps',
    load: () => import('@workers/sitemaps/workers').then(module => module.sitemaps),
  },
  {
    queueName: 'memberships',
    load: () => import('@workers/memberships/workers').then(module => module.memberships),
  },
  {
    queueName: 'spam_detection',
    load: () =>
      import('@workers/spam-detection/workers').then(module => module.spamDetectionWorker),
  },
  {
    queueName: 'ban_evasion',
    load: () => import('@workers/ban-evasion/workers').then(module => module.banEvasionWorker),
  },
  {
    queueName: 'admin-imports',
    load: () => import('@workers/admin-imports/workers').then(module => module.adminImports),
  },
  {
    queueName: 'user-rss-feed-imports',
    load: () =>
      import('@workers/user-rss-feed-imports/workers').then(module => module.userRssFeedImports),
  },
  {
    queueName: 'kagi-smallweb',
    load: () => import('@workers/kagi-smallweb/workers').then(module => module.kagiSmallWeb),
  },
]
