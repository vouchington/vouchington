import type { TestProjectConfiguration } from 'vitest/config'

export const retirementFile =
  'backend/data-stores/psql/migration-runner/guard-and-retire-monthly-partition.test.mts'

/**
 * Real clearance-month retirement waits for ACCESS EXCLUSIVE on posts, feedbacks and retained
 * identities. That wait deadlocks with any concurrent writer in either order, so it runs alone,
 * after every other DB project has finished.
 */
export function retirementProject(defaults: Record<string, unknown>): TestProjectConfiguration {
  return {
    extends: true,
    test: {
      ...defaults,
      name: 'backend-partition-retirement',
      sequence: { groupOrder: 2 },
      isolate: true,
      runner: './test-helpers/vitest.runner.shared-db-scope-guard.mts',
      include: [retirementFile],
      exclude: ['**/node_modules/**', '**/.git/**'],
    },
  }
}
