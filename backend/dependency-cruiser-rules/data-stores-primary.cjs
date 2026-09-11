module.exports = [
  {
    name: 'no-data-stores-imports-unrestricted',
    comment:
      'Only backend/services/ and backend/test-helpers/ may import @data-stores/*. ' +
      'Other areas have specific allowlists. Which valkey concern a consumer may touch is ' +
      'enforced by the pnpm workspace graph: each per-concern package ' +
      '(@data-stores/valkey-{core,pubsub,rate-limiter,glide-mq}) must be declared in the ' +
      "consumer's package.json.",
    severity: 'error',
    from: {
      path: '^backend/',
      pathNot: [
        '^backend/services/',
        '^backend/test-helpers/',
        '^backend/data-stores/',
        '^backend/queues/',
        '^backend/workers/',
        '^backend/flows/',
        '^backend/api/',
        '^backend/rss/',
        '^backend/entrypoints/api/',
        '^backend/scripts/explain-analyze/',
        '^backend/scripts/seeds/',
      ],
    },
    to: {
      path: '^backend/data-stores/',
      pathNot: '^backend/data-stores/graceful-shutdown',
    },
  },

  {
    name: 'no-data-stores-imports-internal',
    comment:
      'backend/data-stores/<pkg>/* may only import from the same package or from: ' +
      'graceful-shutdown, valkey-core (shared valkey leaf), psql, analytics.',
    severity: 'error',
    from: {
      path: '^(backend/data-stores/[^/]+)/',
    },
    to: {
      path: '^backend/data-stores/',
      pathNot: [
        '^$1($|[/.])',
        '^backend/data-stores/graceful-shutdown($|[/.])',
        '^backend/data-stores/valkey-core($|[/.])',
        '^backend/data-stores/psql($|[/.])',
        '^backend/data-stores/analytics($|[/.])',
      ],
    },
  },
]
