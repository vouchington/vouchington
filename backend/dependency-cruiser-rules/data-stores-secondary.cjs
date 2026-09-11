module.exports = [
  {
    name: 'no-psql-imports-queues-flows',
    comment:
      'backend/queues/ and backend/flows/ must not import @data-stores/psql; ' +
      'queue and flow producers stay Valkey-only.',
    severity: 'error',
    from: {
      path: '^backend/(queues|flows)/',
    },
    to: {
      path: '^backend/data-stores/psql',
    },
  },

  {
    name: 'no-psql-imports-workers',
    comment:
      'backend/workers/ must not import @data-stores/psql, except backend/workers/psql/ ' +
      '(see no-psql-imports-workers-psql).',
    severity: 'error',
    from: {
      path: '^backend/workers/',
      pathNot: '^backend/workers/psql/',
    },
    to: {
      path: '^backend/data-stores/psql',
    },
  },

  {
    name: 'no-psql-imports-workers-psql',
    comment:
      'backend/workers/psql/ may only import @data-stores/psql/migrate (migration jobs) from psql.',
    severity: 'error',
    from: {
      path: '^backend/workers/psql/',
    },
    to: {
      path: '^backend/data-stores/psql',
      pathNot: '^backend/data-stores/psql/migrate',
    },
  },

  {
    name: 'no-data-stores-imports-entrypoint-api',
    comment:
      'backend/entrypoints/api/ may only import @data-stores/graceful-shutdown and ' +
      '@data-stores/psql/migrate (ECS migration task entry).',
    severity: 'error',
    from: {
      path: '^backend/entrypoints/api/',
    },
    to: {
      path: '^backend/data-stores/',
      pathNot: ['^backend/data-stores/graceful-shutdown', '^backend/data-stores/psql/migrate'],
    },
  },

  {
    name: 'no-data-stores-imports-explain-analyze',
    comment: 'backend/scripts/explain-analyze/ may only import @data-stores/psql.',
    severity: 'error',
    from: {
      path: '^backend/scripts/explain-analyze/',
    },
    to: {
      path: '^backend/data-stores/',
      pathNot: ['^backend/data-stores/graceful-shutdown', '^backend/data-stores/psql'],
    },
  },

  {
    name: 'no-data-stores-in-tests',
    comment: 'Test files outside backend/data-stores/ may not import @data-stores/* modules.',
    severity: 'error',
    from: {
      path: '\\.test\\.mts$',
      pathNot: ['^backend/data-stores/'],
    },
    to: {
      path: '^backend/data-stores/',
      pathNot: '^backend/data-stores/graceful-shutdown',
    },
  },
]
