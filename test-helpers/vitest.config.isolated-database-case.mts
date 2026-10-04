import { defineConfig } from 'vitest/config'
import { isolatedDatabaseCaseAliases } from './vitest-config/aliases.mts'
import { IsolatedDatabaseCaseReporter } from './vitest-isolated-database-case-reporter.mts'
import {
  getIsolatedDatabaseChildCase,
  isolatedTestNamePattern,
  type IsolatedDatabaseCaseId,
} from './vitest-isolated-database-cases.mts'

const isolatedCase = getIsolatedDatabaseChildCase()
const caseId = process.env.VITEST_ISOLATED_DATABASE_CASE as IsolatedDatabaseCaseId

export default defineConfig({
  resolve: { alias: isolatedDatabaseCaseAliases(isolatedCase.file) },
  test: {
    name: 'isolated-database-case',
    pool: 'forks',
    isolate: true,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 20_000,
    include: [isolatedCase.file],
    testNamePattern: isolatedTestNamePattern(caseId),
    reporters: ['default', new IsolatedDatabaseCaseReporter()],
    setupFiles: [
      './backend/test-helpers/vitest.setup.sentry-mock.mts',
      './backend/test-helpers/vitest.setup.aws-mocks.mts',
      './backend/test-helpers/vitest.setup.captcha-skip.mts',
      './backend/test-helpers/vitest.setup.server-error-responses.mts',
    ],
  },
})
