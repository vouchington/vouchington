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
    queueName: 'find-your-friends',
    load: () => import('@workers/find-your-friends/workers').then(module => module.findYourFriends),
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
  {
    queueName: 'emails',
    load: () => import('@workers/emails/workers').then(module => module.emails),
  },
  { queueName: 'psql', load: () => import('@workers/psql/workers').then(module => module.psql) },
  {
    queueName: 'bloom-filters',
    load: () => import('@workers/bloom-filters/workers').then(module => module.bloomFilters),
  },
  {
    queueName: 'memberships',
    load: () => import('@workers/memberships/workers').then(module => module.memberships),
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
]
