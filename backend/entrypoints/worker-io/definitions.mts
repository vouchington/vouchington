import type { ScheduleDefinition } from '@backend/worker-runtime'

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  {
    queueName: 'background',
    load: async () => {
      const [{ upsertBackgroundSchedules }, ...domains] = await Promise.all([
        import('@queues/background/enqueues/schedules'),
        import('@queues/ses-inbound/enqueues/schedules'),
        import('@queues/openai-moderation/enqueues/schedules'),
        import('@queues/story-post-related-url-projections/enqueues/schedules'),
        import('@queues/post-publication/enqueues/schedules'),
        import('@queues/vote-aggregation/enqueues/schedules'),
        import('@queues/entity-listeners/enqueues/schedules'),
        import('@queues/account-lifecycle/enqueues/schedules'),
        import('@queues/oauth-authorization-exchange/enqueues/schedules'),
        import('@queues/notifications/enqueues/schedules'),
        import('@queues/activitypub/enqueues/schedules'),
        import('@queues/rss-feeds/enqueues/schedules'),
        import('@queues/urls-domains-blacklist/enqueues/schedules'),
        import('@queues/sitemaps/enqueues/schedules'),
        import('@queues/kagi-smallweb/enqueues/schedules'),
      ])
      return async () => {
        await upsertBackgroundSchedules(domains.map(domain => domain.scheduledJobManifest))
      }
    },
  },
  {
    queueName: 'find-your-friends',
    load: () =>
      import('@queues/find-your-friends/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'rss-feed-maintenance',
    load: () =>
      import('@queues/rss-feed-maintenance/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'emails',
    load: () => import('@queues/emails/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'psql',
    load: () => import('@queues/psql/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'bloom-filters',
    load: () =>
      import('@queues/bloom-filters/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'memberships',
    load: () =>
      import('@queues/memberships/enqueues/schedules').then(module => module.upsertSchedules),
  },
]
