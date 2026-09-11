import type { ScheduleDefinition } from '@backend/worker-runtime'

export const SCHEDULE_DEFINITIONS: ScheduleDefinition[] = [
  {
    queueName: 'story-post-related-url-projections',
    load: () =>
      import('@queues/story-post-related-url-projections/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'post-publication',
    load: () =>
      import('@queues/post-publication/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'activitypub-inbox',
    load: () =>
      import('@queues/activitypub-inbox/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'entity-listeners',
    load: () =>
      import('@queues/entity-listeners/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'notifications',
    load: () =>
      import('@queues/notifications/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'urls-domains-blacklist',
    load: () =>
      import('@queues/urls-domains-blacklist/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'rss-feeds',
    load: () =>
      import('@queues/rss-feeds/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'rss-feed-item-categories',
    load: () =>
      import('@queues/rss-feed-item-categories/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'topic-aliases',
    load: () =>
      import('@queues/topic-aliases/enqueues/schedules').then(module => module.upsertSchedules),
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
    queueName: 'account-data-requests',
    load: () =>
      import('@queues/account-data-requests/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'user-deletions',
    load: () =>
      import('@queues/user-deletions/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'oauth-authorization-exchange',
    load: () =>
      import('@queues/oauth-authorization-exchange/enqueues/schedules').then(
        module => module.upsertSchedules,
      ),
  },
  {
    queueName: 'bloom-filters',
    load: () =>
      import('@queues/bloom-filters/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'find-your-friends',
    load: () =>
      import('@queues/find-your-friends/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'sitemaps',
    load: () =>
      import('@queues/sitemaps/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'memberships',
    load: () =>
      import('@queues/memberships/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'vote-weight',
    load: () =>
      import('@queues/vote-weight/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'kagi-smallweb',
    load: () =>
      import('@queues/kagi-smallweb/enqueues/schedules').then(module => module.upsertSchedules),
  },
  {
    queueName: 'ses_inbound',
    load: () =>
      import('@queues/ses-inbound/enqueues/schedules').then(module => module.upsertSchedules),
  },
]
