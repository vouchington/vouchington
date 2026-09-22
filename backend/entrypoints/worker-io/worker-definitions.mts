import type { WorkerDefinition } from '@backend/worker-runtime'

export const WORKER_DEFINITIONS: WorkerDefinition[] = [
  {
    queueName: 'story-post-related-url-projections',
    load: () =>
      import('@workers/story-post-related-url-projections/workers').then(
        module => module.storyPostRelatedUrlProjections,
      ),
  },
  {
    queueName: 'post-publication',
    load: () => import('@workers/post-publication/workers').then(module => module.postPublication),
  },
  {
    queueName: 'topic-ratings',
    load: () => import('@workers/topic-ratings/workers').then(module => module.topicRatings),
  },
  {
    queueName: 'elections',
    load: () => import('@workers/elections/workers').then(module => module.elections),
  },
  {
    queueName: 'entity-metrics-cache-refresh',
    load: () =>
      import('@workers/entity-metrics-cache-refresh/workers').then(
        module => module.entityMetricsCacheRefresh,
      ),
  },
  {
    queueName: 'cache-purge',
    load: () => import('@workers/cache-purge/workers').then(module => module.cachePurge),
  },
  {
    queueName: 'entity-listeners',
    load: () =>
      import('@workers/entity-listeners/workers').then(module => module.entitiesListeners),
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
    queueName: 'rss-feed-discoverability',
    load: () =>
      import('@workers/rss-feed-discoverability/workers').then(
        module => module.rssFeedDiscoverability,
      ),
  },
  {
    queueName: 'crawl_embeds',
    load: () => import('@workers/crawl-embeds/workers').then(module => module.crawlEmbeds),
  },
  {
    queueName: 'rss-feed-item-categories',
    load: () =>
      import('@workers/rss-feed-item-categories/workers').then(
        module => module.rssFeedItemCategories,
      ),
  },
  {
    queueName: 'topic-aliases',
    load: () => import('@workers/topic-aliases/workers').then(module => module.topicAliases),
  },
  {
    queueName: 'openai_moderation_omni_single',
    load: () =>
      import('@workers/openai-moderation/workers').then(
        module => module.openai_moderation_omni_single,
      ),
  },
  {
    queueName: 'post-mentions',
    load: () => import('@workers/post-mentions/workers').then(module => module.postMentions),
  },
  { queueName: 'psql', load: () => import('@workers/psql/workers').then(module => module.psql) },
  {
    queueName: 'account-data-requests',
    load: () =>
      import('@workers/account-data-requests/workers').then(module => module.accountDataRequests),
  },
  {
    queueName: 'user-deletions',
    load: () => import('@workers/user-deletions/workers').then(module => module.userDeletions),
  },
  {
    queueName: 'oauth-authorization-exchange',
    load: () =>
      import('@workers/oauth-authorization-exchange/workers').then(
        module => module.oauthAuthorizationExchangeWorker,
      ),
  },
  {
    queueName: 'activitypub-delivery',
    load: () =>
      import('@workers/activitypub-delivery/workers').then(
        module => module.activitypubDeliveryWorker,
      ),
  },
  {
    queueName: 'activitypub-inbox',
    load: () =>
      import('@workers/activitypub-inbox/workers').then(module => module.activitypubInboxWorker),
  },
  {
    queueName: 'bloom-filters',
    load: () => import('@workers/bloom-filters/workers').then(module => module.bloomFilters),
  },
  {
    queueName: 'find-your-friends',
    load: () => import('@workers/find-your-friends/workers').then(module => module.findYourFriends),
  },
  {
    queueName: 'follower-distributions',
    load: () =>
      import('@workers/follower-distributions/workers').then(
        module => module.followerDistributionsWorker,
      ),
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
    queueName: 'notifications',
    load: () => import('@workers/notifications/workers').then(module => module.notificationsWorker),
  },
  {
    queueName: 'vote-weight',
    load: () => import('@workers/vote-weight/workers').then(module => module.voteWeight),
  },
  {
    queueName: 'vote-integrity',
    load: () => import('@workers/vote-integrity/workers').then(module => module.voteIntegrity),
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
    queueName: 'article-sync',
    load: () => import('@workers/article-sync/workers').then(module => module.articleSyncWorker),
  },
  {
    queueName: 'kagi-smallweb',
    load: () => import('@workers/kagi-smallweb/workers').then(module => module.kagiSmallWeb),
  },
  {
    queueName: 'ses_inbound',
    load: () => import('@workers/ses-inbound/workers').then(module => module.sesInboundWorker),
  },
  {
    queueName: 'report_integrity',
    load: () => import('@workers/report-integrity/workers').then(module => module.reportIntegrity),
  },
  {
    queueName: 'bluesky-follow-propagation',
    load: () =>
      import('@workers/bluesky-follow-propagation/workers').then(
        module => module.blueskyFollowPropagationWorker,
      ),
  },
]
