import type { TestProjectConfiguration } from 'vitest/config'
import { backendDataStoreTestDefaults } from './backend-data-projects.mts'

/**
 * Real clearance-month retirement waits for ACCESS EXCLUSIVE on posts, feedbacks and retained
 * identities. That wait deadlocks with any concurrent writer in either order, so it runs alone,
 * after every other DB project has finished.
 */
export const backendPartitionRetirementProjects: TestProjectConfiguration[] = [
  {
    extends: true,
    test: {
      ...backendDataStoreTestDefaults,
      name: 'backend-partition-retirement',
      sequence: { groupOrder: 2 },
      isolate: true,
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      include: [
        'backend/data-stores/psql/migration-runner/guard-and-retire-monthly-partition.test.mts',
      ],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  },
]
