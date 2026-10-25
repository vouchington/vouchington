// Runtime code cannot become dependent on test infrastructure. Runner configuration
// consumers have an exact destination exception, never a whole-source exemption.
const helperPath = '(?:^|/)test-helpers(?:/|$)|^@voucha/test-helpers(?:/|$)'
const configConsumers = '^ci/check-(?:coverage-scope|storybook-browser-optimize-deps)\\.mts$'
const testPaths = [
  '(?:^|/)(?:test-helpers|__tests__|__fixtures__|storybook|\\.storybook)(?:/|$)',
  '\\.(?:test|spec|stories)\\.[cm]?[jt]sx?$',
]

module.exports = [
  {
    name: 'no-production-to-test-helpers',
    severity: 'error',
    comment: 'Runtime modules and CI checks must own their implementation outside test helpers.',
    from: {
      path: '^(?:backend/(?:api|services|workers|data-stores|modules|agents|mcp|queues|entrypoints|config|service-registrations|worker-runtime|rss|md|types)/|ts-shared/|email-templates/|cloudflare-worker/|web/|lambdas/|ci/check-[^/]+\\.mts$)',
      pathNot: [...testPaths, configConsumers],
    },
    to: { path: helperPath },
  },
  {
    name: 'no-production-to-test-helpers-config-consumers',
    severity: 'error',
    comment:
      'These runner checks may read canonical Vitest configuration, but no other test helper.',
    from: { path: configConsumers },
    to: { path: helperPath, pathNot: '^test-helpers/vitest-config/' },
  },
]
