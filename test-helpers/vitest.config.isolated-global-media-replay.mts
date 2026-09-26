import { defineConfig } from 'vitest/config'
import { backendAliases } from './vitest-config/aliases.mts'

export default defineConfig({
  resolve: { alias: backendAliases() },
  test: {
    name: 'isolated-global-media-replay',
    pool: 'forks',
    isolate: true,
    maxWorkers: 1,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 20_000,
    include: ['backend/api/v1/copyright-notices/copyright-notices.replay.isolated.test.mts'],
    setupFiles: [
      './backend/test-helpers/vitest.setup.sentry-mock.mts',
      './backend/test-helpers/vitest.setup.aws-mocks.mts',
      './backend/test-helpers/vitest.setup.captcha-skip.mts',
      './backend/test-helpers/vitest.setup.server-error-responses.mts',
    ],
  },
})
