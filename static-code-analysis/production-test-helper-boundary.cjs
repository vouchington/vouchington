// Runtime code cannot become dependent on test infrastructure or test fixtures. Runner
// configuration consumers have an exact destination exception, never a whole-source exemption.
// Production contracts belong in `api-contracts/`, never in `api-fixtures/`.
// Runtime modules also never depend on `ci/**`; CI tooling is not production code.
const helperPath = '(?:^|/)test-helpers(?:/|$)|^@voucha/test-helpers(?:/|$)'
const configConsumers = '^ci/(?:write-coverage-scope|check-storybook-browser-optimize-deps)\\.mts$'
const fixturePath = '(?:^|/)api-fixtures(?:/|$)|^@voucha/api-fixtures(?:/|$)'
const runtimeInner =
  'backend/(?:api|services|workers|data-stores|modules|agents|mcp|queues|entrypoints|config|service-registrations|worker-runtime|rss|md|types)/|ts-shared/|email-templates/|cloudflare-worker/|web/|lambdas/'
const runtimeSources = `^(?:${runtimeInner})`
const productionSources = `^(?:${runtimeInner}|ci/check-[^/]+\\.mts$)`
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
      path: productionSources,
      pathNot: [...testPaths, configConsumers],
    },
    to: { path: helperPath },
  },
  {
    name: 'no-production-to-api-fixtures',
    severity: 'error',
    comment:
      'Runtime modules must not read the shared test fixture corpus; production contracts live in api-contracts.',
    from: { path: productionSources, pathNot: testPaths },
    to: { path: fixturePath },
  },
  {
    name: 'no-production-to-test-helpers-config-consumers',
    severity: 'error',
    comment:
      'These runner checks may read canonical Vitest configuration, but no other test helper.',
    from: { path: configConsumers },
    to: { path: helperPath, pathNot: '^test-helpers/vitest-config/' },
  },
  {
    name: 'no-production-to-ci',
    severity: 'error',
    comment: 'Runtime modules must never depend on CI tooling; ci/** is not production code.',
    from: { path: runtimeSources, pathNot: testPaths },
    to: { path: '^ci/' },
  },
]
