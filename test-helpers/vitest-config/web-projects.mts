import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import type { TestProjectConfiguration } from 'vitest/config'
import { storybookBrowserProject, webAlias } from './storybook-browser-project.mts'
import { storybookMockResolveAliases } from './storybook-browser-aliases.mts'

// Default budget from #10762 (docs/development/reference-tests-vitest-projects.md); plain numbers, unlike toolingTestBudget.
const defaultTestBudget = { hookTimeout: 30_000, testTimeout: 15_000 }
const webApiProject: TestProjectConfiguration = {
  extends: true,
  resolve: { alias: webAlias },
  test: {
    ...defaultTestBudget,
    pool: 'forks',
    isolate: false,
    name: 'web-api',
    include: ['integration-tests/web-api/**/*.test.mts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
    environment: 'node',
    globalSetup: './test-helpers/vitest.setup.data-stores.mts',
    setupFiles: [
      './test-helpers/vitest.setup.dynamic-config-isolation.mts',
      './test-helpers/vitest.setup.glide-mq-workers.mts',
      './backend/test-helpers/vitest.setup.aws-mocks.mts',
      './backend/test-helpers/vitest.setup.captcha-skip.mts',
    ],
  },
}

const webIntegrationProject: TestProjectConfiguration = {
  extends: true,
  resolve: { alias: webAlias },
  test: {
    pool: 'forks',
    // The trace proxy is append-only and scoped by x-request-id, so parallel files are safe.
    isolate: false,
    name: 'web-integration',
    include: ['integration-tests/web/tests/**/*.test.mts'],
    exclude: ['**/node_modules/**', '**/.git/**'],
    environment: 'node',
    globalSetup: './integration-tests/web/helpers/global-setup.mts',
    testTimeout: 30_000,
    // Global setup boots 4 real processes (backend, image lambda, Next.js, and the
    // cloudflare worker via scripts/wrangler/start.mts, which auto-restarts wrangler
    // on an unexpected crash) and seeds the DB — kept above the CI step's tight
    // 5-minute budget (tests-web-integration.yml) to absorb slower cold starts on a
    // contended local dev host running multiple worktrees concurrently.
    hookTimeout: 90_000,
  },
}

export const webProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    plugins: [react()],
    resolve: {
      alias: {
        ...webAlias,
        '@testing-library/react': resolve(process.cwd(), 'web/node_modules/@testing-library/react'),
        '@testing-library/jest-dom': resolve(
          process.cwd(),
          'web/node_modules/@testing-library/jest-dom',
        ),
      },
    },
    test: {
      ...defaultTestBudget,
      isolate: true,
      name: 'web',
      include: ['web/**/*.test.ts', 'web/**/*.test.tsx'],
      exclude: ['**/node_modules/**', '**/.git/**', 'web/.next/**', 'web/storybook/**'],
      environment: 'jsdom',
      setupFiles: ['./web/test-helpers/vitest.setup.web.mts'],
    },
  },
  {
    extends: true,
    plugins: [react()],
    resolve: {
      alias: [
        ...storybookMockResolveAliases,
        ...Object.entries(webAlias).map(([find, replacement]) => ({ find, replacement })),
      ],
    },
    test: {
      ...defaultTestBudget,
      isolate: true,
      name: 'web-storybook',
      include: ['web/storybook/**/*.test.ts', 'web/storybook/**/*.test.tsx'],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        'web/storybook/__tests__/component-story-coverage.test.ts',
      ],
      environment: 'node',
      setupFiles: ['./web/test-helpers/vitest.setup.web-storybook.mts'],
    },
  },
  {
    extends: true,
    plugins: [react()],
    resolve: {
      alias: [
        ...storybookMockResolveAliases,
        ...Object.entries(webAlias).map(([find, replacement]) => ({ find, replacement })),
      ],
    },
    test: {
      ...defaultTestBudget,
      isolate: true,
      name: 'web-storybook-component-coverage',
      include: ['web/storybook/__tests__/component-story-coverage.test.ts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
      environment: 'node',
      setupFiles: ['./web/test-helpers/vitest.setup.web-storybook.mts'],
    },
  },
  storybookBrowserProject,
  webApiProject,
  webIntegrationProject,
  {
    extends: true,
    test: {
      ...defaultTestBudget,
      isolate: false,
      name: 'lambdas',
      include: ['lambdas/**/*.test.mts'],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        'lambdas/**/node_modules/**',
        '**/*.mock.test.mts',
        'lambdas/dev-server.test.mts',
      ],
    },
  },
  {
    extends: true,
    test: {
      ...defaultTestBudget,
      env: {
        S3_BUCKET_IMAGES: 'test-images',
        S3_BUCKET_RENDERS: 'test-renders',
      },
      isolate: false,
      name: 'lambdas-portability',
      include: ['lambdas/dev-server.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**', 'lambdas/**/node_modules/**'],
    },
  },
  {
    extends: true,
    test: {
      ...defaultTestBudget,
      env: {
        S3_BUCKET_IMAGES: 'test-images',
        S3_BUCKET_RENDERS: 'test-renders',
      },
      isolate: true,
      name: 'lambdas-mocks',
      include: ['lambdas/**/*.mock.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**', 'lambdas/**/node_modules/**'],
    },
  },
  {
    extends: true,
    test: {
      ...defaultTestBudget,
      isolate: false,
      name: 'cloudflare-worker',
      include: ['cloudflare-worker/**/*.test.mts'],
      exclude: [
        '**/node_modules/**',
        '**/.git/**',
        'cloudflare-worker/**/*.mock.test.mts',
        'cloudflare-worker/scripts/wrangler/runtime.test.mts',
      ],
    },
  },
  {
    extends: true,
    test: {
      ...defaultTestBudget,
      isolate: false,
      name: 'cloudflare-worker-portability',
      include: ['cloudflare-worker/scripts/wrangler/runtime.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  },
  {
    extends: true,
    test: {
      ...defaultTestBudget,
      isolate: true,
      name: 'cloudflare-worker-mocks',
      include: ['cloudflare-worker/**/*.mock.test.mts'],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  },
]
