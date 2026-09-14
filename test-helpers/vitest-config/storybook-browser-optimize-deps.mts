// Nested Vite specifiers resolve transitive browser imports through the workspace package that
// declares them. Keep this catalog synchronized with the completeness contract in
// ci/vitest-storybook-browser-config.test.mts.
export const storybookBrowserOptimizeDeps = [
  '@ts-shared/feature-flags > @vouchington/utils/feature-flags',
  '@ts-shared/languages > @vouchington/utils/language-tags',
  '@ts-shared/ui-messages > @vouchington/utils/message-catalog',
  '@ts-shared/url-signing > @vouchington/utils/url-signing',
  '@ts-shared/utils > @vouchington/html-utils',
  '@ts-shared/utils > @vouchington/phone-validation',
  '@ts-shared/utils > @vouchington/utils/bigint-ids',
  '@ts-shared/utils > @vouchington/utils/collections',
  '@ts-shared/utils > @vouchington/utils/cookies',
  '@ts-shared/utils > @vouchington/utils/dates',
  '@ts-shared/utils > @vouchington/utils/fetch-ports',
  '@ts-shared/utils > @vouchington/utils/format',
  '@ts-shared/utils > @vouchington/utils/gtin',
  '@ts-shared/utils > @vouchington/utils/hashtags',
  '@ts-shared/utils > @vouchington/utils/observability',
  '@ts-shared/utils > @vouchington/utils/query-string',
  '@ts-shared/utils > @vouchington/utils/query',
  '@ts-shared/utils > @vouchington/utils/slugs',
  '@ts-shared/utils > @vouchington/utils/strings',
  '@ts-shared/utils > @vouchington/utils/text-metrics',
  '@ts-shared/utils > @vouchington/utils/urls',
  '@ts-shared/utils > @vouchington/utils/validation',
  'jose',
  '@ts-shared/session-jwt > @vouchington/session-jwt',
  '@ts-shared/session-jwt > uuid',
  '@ts-shared/money > @vouchington/utils/money',
  '@ts-shared/session-jwt > @vouchington/utils/cookies',
  '@ts-shared/url-signing > @vouchington/utils/url-signing',
] as const

type OptimizeDepsConfig = { optimizeDeps: { exclude?: string[]; include?: string[] } }

const storybookBrowserOptimizeDepsExclude = ['next/image', 'next/headers'] as const

export const applyStorybookBrowserOptimizeDeps = (config: OptimizeDepsConfig): void => {
  const optimizeDeps = config.optimizeDeps
  const excluded = new Set<string>(storybookBrowserOptimizeDepsExclude)
  optimizeDeps.include = [
    ...new Set([
      ...(optimizeDeps.include ?? []).filter(dep => !excluded.has(dep)),
      ...storybookBrowserOptimizeDeps,
    ]),
  ]
  optimizeDeps.exclude = [...new Set([...(optimizeDeps.exclude ?? []), ...excluded])]
}
