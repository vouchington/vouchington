import type { ViteUserConfig } from 'vitest/config'

type CoverageConfig = NonNullable<NonNullable<ViteUserConfig['test']>['coverage']>

export const coverageConfigForScope = (scope: string | undefined): CoverageConfig => {
  const portability = scope === 'portability'
  const tooling = scope === 'tooling'
  const storybook = scope === 'web-storybook'
  const storybookBrowser = scope === 'web-storybook-browser'
  const webLibApi = scope === 'web-lib-api'
  const scoped =
    tooling || portability || scope === 'web' || storybook || storybookBrowser || webLibApi
  return {
    include: portability
      ? ['lambdas/dev-server.mts', 'cloudflare-worker/scripts/wrangler/runtime.mts']
      : tooling
        ? [
            'ci/**/*.{mts,ts,tsx}',
            'dev/**/*.{mts,ts,tsx}',
            'playwright/helpers/**/*.{mts,ts,tsx}',
            'static-code-analysis/**/*.{mts,ts,tsx}',
            'test-tooling/**/*.{mts,ts,tsx}',
          ]
        : storybook
          ? [
              'web/storybook/entities/entity-fixtures.ts',
              'web/storybook/entities/topics-story-recommendations.ts',
              'web/test-helpers/storybook/component-story-coverage/message.ts',
            ]
          : storybookBrowser
            ? ['web/components/**/*.{ts,tsx}', 'web/hooks/**/*.{ts,tsx}']
            : scope === 'web'
              ? ['web/**/*.{mts,ts,tsx}']
              : webLibApi
                ? ['web/lib/api/**/*.{ts,mts}']
                : ['**/*.{mts,ts,tsx}'],
    exclude: [
      ...(scoped ? [] : ['ci/**', 'dev/**', 'playwright/**', 'static-code-analysis/**']),
      'integration-tests/**',
      'playwright.config.mts',
      'backend/dev.mts',
      'backend/services/localization/compile-cli.mts',
      'web/instrumentation.ts',
      'web/next.config.ts',
      'web/*.config.ts',
      '**/esbuild.config.mts',
      'lambdas/image-resize/scripts/copy-og-fonts.mts',
      '**/.wrangler/**',
      '**/.next/**',
      ...(storybook || portability ? [] : ['**/test-helpers/**']),
      '**/fixtures/**',
      'backend/scripts/seeds/playwright-test-data/**',
      '**/__snapshots__/**',
      'web/storybook/**/*.stories.{ts,tsx}',
      ...(storybook ? [] : ['web/storybook/entities/entity-fixtures.ts']),
      'web/storybook/entities/entity-story-frame.tsx',
      'web/storybook/entities/storybook-providers.tsx',
      'web/storybook/mocks/**',
      '**/*.d.mts',
      '**/*.d.ts',
      ...(storybook ? [] : ['**/*.{test,spec}.{mts,ts,tsx}']),
    ],
    reporter: ['text-summary', 'lcov', 'json-summary'],
  }
}

export const runtimeCoverageConfigForScope = (scope: string | undefined): CoverageConfig => {
  const config = coverageConfigForScope(scope)
  if (scope !== 'web-storybook-browser') return config

  // Vitest 5 resolves browser coverage globs from the selected project's `web` root. Keep
  // coverageConfigForScope() repository-relative for suite descriptors, but make its runtime
  // form project-relative so the collector does not look under `web/web/**` and emit empty LCOV.
  return {
    ...config,
    include: ['components/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}'],
  }
}
