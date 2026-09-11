module.exports = [
  {
    name: 'queues-entity-cache-imports',
    comment:
      'backend/queues/* must not import @services/entity-cache/get. ' +
      'Read from the database directly instead.',
    severity: 'error',
    from: {
      path: '^backend/queues/',
      pathNot: '\\.(test|spec)\\.',
    },
    to: {
      path: '^backend/services/entity-cache/get($|[./])',
    },
  },

  {
    name: 'no-workers-from-queues',
    comment: 'backend/queues/* must not import backend/workers/*.',
    severity: 'error',
    from: {
      path: '^backend/queues/',
    },
    to: {
      path: '^backend/workers/',
    },
  },

  {
    name: 'no-workers-from-api-entrypoint',
    comment: 'backend/entrypoints/api/* must not directly import backend/workers/*.',
    severity: 'error',
    from: {
      path: '^backend/entrypoints/api/',
    },
    to: {
      path: '^backend/workers/',
    },
  },

  {
    name: 'notifications-must-not-own-follower-distribution',
    comment:
      '@services/notifications must not import @services/follower-distributions; ' +
      'follower-send workflows belong to @services/follower-distributions.',
    severity: 'error',
    from: {
      path: '^backend/services/notifications/',
    },
    to: {
      path: '^backend/services/follower-distributions/',
    },
  },

  {
    name: 'api-follower-send-imports-owner-service',
    comment:
      'Follower-send API routes must import parser/send helpers from ' +
      '@services/follower-distributions, not @services/notifications.',
    severity: 'error',
    from: {
      path: '^backend/api/v1/(posts|rss-feed-items)/.*share-send\\.mts$',
    },
    to: {
      path: '^backend/services/notifications/',
    },
  },
]
