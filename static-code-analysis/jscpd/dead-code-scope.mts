const entry = [
  '.pr-shepherd/classification/*.mts',
  'backend/data-stores/psql/config-driven/*.mts',
  'backend/entrypoints/api/verify-ipv6-egress.mts',
  'backend/entrypoints/worker-cpu/serve.mts',
  'backend/modules/structured-decisions/benchmark.mts',
  'backend/scripts/backfill-rss-feed-item-source-publications.mts',
  'backend/scripts/seed-source/run.mts',
  'backend/types/lib-dom-absent.mts',
  'ci/transient-retry/rerun-known-transient.mts',
  'dev/agent-issue-labels/batch-issues.mts',
  'dev/agent-issue-labels/labels-from-paths.mts',
  'dev/codex-hooks/persist-session-id.mts',
  'dev/codex-hooks/post-tool-use.mts',
  'dev/codex-hooks/pre-tool-use.mts',
  'dev/localization/local-catalog.mts',
  'dev/localization/local-smoke.mts',
  'dev/native-addon-readiness.mts',
  'dev/otel-register.mts',
  'static-code-analysis/oxlint-plugin.cjs',
  'static-code-analysis/repo-file-policy-worker.mts',
  'web/generate-membership-benefit-catalog.ts',
  'web/storybook/mocks/contribute-cta-aside.tsx',
  'web/storybook/mocks/get-resolved-ui-locale.ts',
  'web/storybook/mocks/get-translations.ts',
  'web/storybook/mocks/languages.ts',
  'web/storybook/mocks/load-server-messages.ts',
  'web/storybook/mocks/upgrade-membership-aside.tsx',
  'web/test-helpers/vitest.setup.fake-timer-guard.mts',
  'web/test-helpers/vitest.setup.storybook-browser-guard.mts',
]

const categories = [
  'unused-file',
  'unused-export',
  'unused-symbol',
  'unused-import',
  'unused-member',
]
const formats = ['typescript', 'tsx', 'javascript', 'sql', 'bash', 'css']
const ignored = ['**/migrations/**', '**/fixtures/**', '**/route-selectors.generated.mts']

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a jscpd configuration object')
  }
  return value as Record<string, unknown>
}

function sameSet(actual: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every(value => typeof value === 'string') &&
    [...actual].sort().join('\0') === [...expected].sort().join('\0')
  )
}

export function validateDeadCodeConfig(value: unknown): string[] {
  const config = object(value)
  const deadCode = object(config['deadCode'])
  const topLevelKeys = [
    'format',
    'crossFormats',
    'failOnEmpty',
    'similarity',
    'minLines',
    'exitCode',
    'deadCode',
    'ignore',
  ]
  if (
    !sameSet(Object.keys(config), topLevelKeys) ||
    !sameSet(Object.keys(deadCode), ['categories', 'minConfidence', 'entry']) ||
    !sameSet(config['format'], formats) ||
    !sameSet(config['ignore'], ignored) ||
    !sameSet(deadCode['categories'], categories) ||
    !sameSet(deadCode['entry'], entry) ||
    deadCode['minConfidence'] !== 70 ||
    config['crossFormats'] !== 'typescript,tsx' ||
    config['failOnEmpty'] !== true
  ) {
    throw new Error('jscpd dead-code scan scope changed; review and update the scope contract')
  }
  return entry
}
