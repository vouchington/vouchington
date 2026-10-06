// Installs the failure-injection triggers and control table that backend test helpers use instead
// of per-test CREATE/DROP TRIGGER on shared tables (see backend/test-helpers/injected-failures.mts).
// Register it after vitest.setup.data-stores.mts, only for projects whose tests inject failures:
// the triggers appear in the live catalog, so projects that run before the PostgreSQL schema
// snapshot check must not install them.
export async function setup() {
  const { installInjectedFailuresForTestDatabase } =
    await import('../backend/test-helpers/injected-failures.mts')
  await installInjectedFailuresForTestDatabase()
}
