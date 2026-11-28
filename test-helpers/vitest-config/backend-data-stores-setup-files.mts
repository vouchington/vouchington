/**
 * Setup files of the backend-data-stores project: the shared data-store setup, then the
 * production-route snapshot. The snapshot comes last so the vi.mock registrations in earlier setup
 * files apply before the route modules load. Other projects that share the data-store setup never
 * run the route sweep, so they skip the cost of loading every API route.
 */
export function backendDataStoresSetupFiles(dataStoreSetupFiles: readonly string[]): string[] {
  return [...dataStoreSetupFiles, './backend/test-helpers/vitest.setup.production-routes.mts']
}
