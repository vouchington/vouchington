import { withOwnedMigrationControl } from './migration-control-scope.mts'

/** Real migration ledger/catalog assertions; not unit SQL-generation or lock emulation. */
export async function assertMigrationRunnerControls(
  sourceUrl: string,
  environment: NodeJS.ProcessEnv,
  record: (name: string) => void,
  recordReserved: (name: string) => void,
): Promise<void> {
  await withOwnedMigrationControl('package', sourceUrl, environment, recordReserved)
  record('applies package SQL migrations through the platform runner')
  await withOwnedMigrationControl('concurrent', sourceUrl, environment, recordReserved)
  record('serializes fixed, generated, and view migrations under one runner lock')
}
